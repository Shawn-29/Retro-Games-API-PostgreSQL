const { queryMulti } = require('../db_query');

const { OK, NOT_FOUND } = require('http-status-codes').StatusCodes;

/* get platform-specific data including genre counts */
const getPlatform = async (req, res) => {

    try {
        doQuery: {
            const pId = req.query.pId;
            if (typeof pId !== 'string' || pId.length === 0 || !Number.isSafeInteger(+pId)) {
                break doQuery;
            }
    
            const platformQuery = `
                select name, release_year, img_url
                from platforms
                where id = %?
            `;
    
            const countQuery = `
                select gr.type type, count(*) count
                from games gm
                left join genres gr
                on gm.genre_id = gr.id
                left join platforms p
                on gm.platform_id = p.id
                where p.id = %?
                group by gr.type
            `;
    
            const result = await queryMulti(
                [platformQuery, [pId]],
                [countQuery, [pId]]
            );

            if (result[0].length > 0) {
                return res.status(OK)
                .json({
                    ...result[0][0],
                    genres: result[1]
                });
            }
        }

    } catch (error) {
        console.error('Could not query single platform.');
        console.error(error);
    }

    return res.status(NOT_FOUND)
        .json({
            data: null,
            genres: null,
            error: 'Could not get specific platform data.'
        });
};

module.exports = getPlatform;