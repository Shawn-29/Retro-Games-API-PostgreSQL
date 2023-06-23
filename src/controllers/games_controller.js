const NodeCache = require('node-cache');

const { query, queryMulti, queryMultiNoParams } = require('../db_query');

const format = require('pg-format');

const { OK, NOT_FOUND } = require('http-status-codes').StatusCodes;

/* valid items per page */
const DEFAULT_IPL = 25;
const validIPL = new Set([
    DEFAULT_IPL,
    50,
    100,
    200
]);

const COLUMN_CACHE_KEY = 'column names';

const queryCache = new NodeCache();

const cacheColumnNames = async () => {

    const validColumnsCache = {
        platforms: null,
        publishers: null,
        developers: null,
        genres: null,
        releaseYears: null
    };

    try {
        const result = await queryMultiNoParams(
            'select name from platforms',
            'select name from publishers',
            'select name from developers',
            'select type as name from genres',
            'select DISTINCT release_year as name from games'
        );

        let index = 0;
        for (const key of Object.keys(validColumnsCache)) {
            validColumnsCache[key] = new Set(result[index].map(value => String(value.name)));
            ++index;
        }

        queryCache.set(COLUMN_CACHE_KEY, validColumnsCache);
    } catch (error) {
        console.error('Could not cache column names.');
        console.error(error);
    }
};

/* get a list of games based on filters provided in the query string */
const getGames = async (req, res) => {

    if (!queryCache.has(COLUMN_CACHE_KEY)) {
        await cacheColumnNames();
    }

    const validColumnsCache = queryCache.get(COLUMN_CACHE_KEY);

    /* these are the only valid categories that games can be filtered by */
    const tblFilters = {};
    for (const key of Object.keys(validColumnsCache)) {
        tblFilters[key] = {
            values: [''],
            placeholders: '%?',
            filterApplied: false
        }
    }

    for (const key of Object.keys(tblFilters)) {
        /* check if this filter type is included in the query params */
        if (!req.query[key]) {
            continue;
        }

        const values = Array.from(
            /* separated columns names from the query string and remove duplicates */
            new Set(req.query[key].split('|')))
            /* lowercase column names for consistent caching (e.g. "NES" and "nes" should be the same) */
            // .map(str => str.toLowerCase())
            /* remove invalid column names that might be in the query string */
            .filter(value => validColumnsCache[key].has(value)
            );

        if (values.length === 0) {
            continue;
        }

        tblFilters[key] = {
            values,

            /* create a placeholder for each value in order to escape each value in the query */
            placeholders: Array.from(values, _ => '%?').join(', '),

            /* search params for this filter has been found so we will no longer
                retrieve all the results for this category */
            filterApplied: true
        };
    }

    let cacheKey = Object.values(tblFilters).flatMap(filter => filter.values).join('');

    const cacheResult = queryCache.get(cacheKey);
    /* check if the query results can be found in the cache so the database doesn't
        have to be queried */
    if (cacheResult) {
        return res.status(OK)
            .json(cacheResult);
    }

    /* build filter conditions for each category */
    const platformFilter = !tblFilters.platforms.filterApplied ? 'true' :
        format(`p.name in (${tblFilters.platforms.placeholders})`,
            ...tblFilters.platforms.values
        );
    const publisherFilter = !tblFilters.publishers.filterApplied ? 'true' :
        format(`pl.name in (${tblFilters.publishers.placeholders})`,
            ...tblFilters.publishers.values
        );
    const developerFilter = !tblFilters.developers.filterApplied ? 'true' :
        format(`d.name in (${tblFilters.developers.placeholders})`,
            ...tblFilters.developers.values
        );
    const genreFilter = !tblFilters.genres.filterApplied ? 'true' :
        format(`gr.type in (${tblFilters.genres.placeholders})`,
            ...tblFilters.genres.values
        );
    const yearFilter = !tblFilters.releaseYears.filterApplied ? 'true' :
        format(`gm.release_year in (${tblFilters.releaseYears.placeholders})`,
            ...tblFilters.releaseYears.values
        );

    /* get subqueries for tables other than the main game table to use for count queries */
    const platSub = !tblFilters.platforms.filterApplied ? 'true' :
        `platform_id in (select id from platforms p where ${platformFilter})`;
    const pubSub = !tblFilters.publishers.filterApplied ? 'true' :
        `publisher_id in (select id from publishers pl where ${publisherFilter})`;
    const devSub = !tblFilters.developers.filterApplied ? 'true' :
        `developer_id in (select id from developers d where ${developerFilter})`;
    const genSub = !tblFilters.genres.filterApplied ? 'true' :
        `genre_id in (select id from genres gr where ${genreFilter})`;

    /* note that PostgreSQL will treat count queries as bigint type and JavaScript
        will interpret that type as a string so we need to perform casts in our
        count queries to properly return numbers to our clients */
    const countQuery = `
        select cast(count(*) as int) total_rows
        from games gm
        where
            ${yearFilter} and ${platSub} and
            ${pubSub} and ${devSub} and ${genSub};
    `;

    /* start querying the database by getting the total number of filtered rows */
    let total_rows = 0;
    try {
        total_rows = (await query(countQuery))[0].total_rows;
    } catch (error) {
        console.error('Count query for games failed.');
        console.error(error);
    }

    /********** get pagination params **********/
    /* get the number of items per list */
    const ipl = validIPL.has(+req.query.ipl) ? +req.query.ipl : DEFAULT_IPL;
    /* get the maximum page number */
    const maxPgn = Math.ceil(total_rows / ipl);
    /* get the current page number */
    const pgn = Number.isSafeInteger(+req.query.pgn) ?
        Math.max(1, Math.min(req.query.pgn, maxPgn)) : 1;

    /* get individual category counts */
    const platformCountQuery = `
        select p.name, count from platforms p
        right join (
            select platform_id, cast(count(*) as int) count
            from games gm
            where ${pubSub} and ${devSub} and
                ${genSub} and ${yearFilter}
            group by platform_id
        ) gm on p.id = gm.platform_id
        order by p.name asc
    `;
    const publisherCountQuery = `
        select pl.name, count from publishers pl
        right join (
            select publisher_id, cast(count(*) as int) count
            from games gm
            where ${platSub} and ${devSub} and
                ${genSub} and ${yearFilter}
            group by publisher_id
        ) gm on pl.id = gm.publisher_id
        order by pl.name asc
    `;
    const developerCountQuery = `
        select d.name, count from developers d
        right join (
            select developer_id, cast(count(*) as int) count
            from games gm
            where ${platSub} and ${pubSub} and
                ${genSub} and ${yearFilter}
            group by developer_id
        ) gm on d.id = gm.developer_id
        order by d.name asc
    `;
    const genreCountQuery = `
        select gr.type name, count from genres gr
        right join (
            select genre_id, cast(count(*) as int) count
            from games gm
            where ${platSub} and ${pubSub} and
                ${devSub} and ${yearFilter}
            group by genre_id
        ) gm on gr.id = gm.genre_id
        order by name asc
    `;
    const yearCountQuery = `
        select gm.release_year name, cast(count(*) as int) count
        from games gm
        where ${platSub} and ${pubSub} and
            ${devSub} and ${genSub}
        group by gm.release_year
        order by gm.release_year asc
    `;

    /* get a list of game data based on filters and pagination */
    const gameListQuery = `
        with base as (
            select gm.id, gm.title, gm.description, gm.release_year,
                p.name platform, pl.name publisher, d.name developer,
                gr.type genre
            from games gm
            left join platforms p
                on gm.platform_id = p.id
            left join publishers pl
                on gm.publisher_id = pl.id
            left join developers d
                on gm.developer_id = d.id
            left join genres gr
                on gm.genre_id = gr.id
            where ${platformFilter} and ${publisherFilter} and ${developerFilter} and
                ${genreFilter} and ${yearFilter}
            order by gm.title asc
            limit %? offset %?
        )
        select title, description, release_year,
            platform, publisher, developer,
            genre,
            (
                select string_agg(url, ',')
                from game_images
                where b.id = game_id
            ) img_urls
        from base b
        group by title, description, release_year,
            platform, publisher, developer,
            genre, img_urls
    `;

    try {
        const result = await queryMulti(
            [gameListQuery, [ipl, ipl * (pgn - 1)]],
            platformCountQuery,
            publisherCountQuery,
            developerCountQuery,
            genreCountQuery,
            yearCountQuery
        );

        const categories = {
            platforms: result[1].map(data => ({
                ...data,
                filterApplied: data.count > 0 && tblFilters.platforms.values.includes(data.name)
            })),
            publishers: result[2].map(data => ({
                ...data,
                count: data.count,
                filterApplied: data.count > 0 && tblFilters.publishers.values.includes(data.name)
            })),
            developers: result[3].map(data => ({
                ...data,
                filterApplied: data.count > 0 && tblFilters.developers.values.includes(data.name)
            })),
            genres: result[4].map(data => ({
                ...data,
                filterApplied: data.count > 0 && tblFilters.genres.values.includes(data.name)
            })),
            releaseYears: result[5].map(data => ({
                ...data,
                filterApplied: data.count > 0 && tblFilters.releaseYears.values.includes(String(data.name))
            })),
        };

        const data = {
            gameData: {
                gameList: result[0],
                categories,
                totalGames: total_rows
            },
            pagination: {
                curPage: pgn,
                maxPage: maxPgn
            }
        };

        /* add pagination info to the cache key */
        cacheKey += pgn + maxPgn + ipl;

        /* cache this response's data */
        queryCache.set(cacheKey, data);

        return res.status(OK)
            .json(data);

    } catch (error) {
        console.error('Could not get game list from database.');
        console.error(error);
    }

    return res.status(NOT_FOUND)
        .json({
            data: null,
            error: 'Could not get game data.'
        });
};

module.exports = getGames;