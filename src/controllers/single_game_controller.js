const { query } = require('../db_query');

const { OK, NOT_FOUND } = require('http-status-codes').StatusCodes;

/* default route; gets a single game by title and platform */
const getSingleGame = async (req, res) => {
    const [title, platform] = req.query?.title?.split('_', 2) ?? '';

    const queryText = `
        select gm.title, gm.release_year, p.name platform,
            pl.name publisher, d.name developer, gr.type genre,
            gm.description,
            string_agg(distinct i.url, ',') img_urls
        from games gm
        left join platforms p
            on gm.platform_id = p.id
        left join publishers pl
            on gm.publisher_id = pl.id
        left join developers d
            on gm.developer_id = d.id
        left join genres gr
            on gm.genre_id = gr.id
        left join game_images i
            on gm.id = i.game_id
        where gm.title = %? and
            p.name = %?
        group by gm.title, gm.release_year, platform,
            publisher, developer, genre,
            gm.description
        limit 1;
    `;

    const params = [title, platform];

    try {
        const result = await query(queryText, params);

        if (result.length> 0) {
            return res.status(OK)
                .json({
                    gameData: result[0]
                });
        }
    } catch (error) {
        console.error('Could not query single game.');
        console.error(`query:`, query, 'params:', params);
        console.error(error);
    }

    return res.status(NOT_FOUND)
        .json({
            gameData: null,
            error: 'Could not get specific game data.'
        });
};

module.exports = getSingleGame;