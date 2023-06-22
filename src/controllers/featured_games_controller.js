const { query } = require('../db_query');

const { OK, NOT_FOUND } = require('http-status-codes').StatusCodes;

const getFeaturedGames = async (_, res) => {
    try {
        const text = `
            select gm.title, gm.release_year, p.name platform,
                pl.name publisher, d.name developer, gr.type genre,
                gm.description,
                string_agg(DISTINCT i.url, ',') as img_urls
            from games gm
            right join featured_games f
                on gm.id = f.id
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
            group by gm.title, gm.release_year, platform,
                publisher, developer, genre,
                gm.description
            `;
        const result = await query(text);
        if (result.length > 0) {
            return res.status(OK)
                .json({
                    featured_games: result
                });            
        }
    } catch (error) {
        console.error('Error retrieving featured games.');
        console.error(error);
    }
    return res.status(NOT_FOUND)
        .json({
            featured_games: null,
            error: 'Could not get featured games.'
        });
};

module.exports = getFeaturedGames;