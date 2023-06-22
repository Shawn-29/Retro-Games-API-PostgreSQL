const { query } = require('../db_query');

const { OK, NOT_FOUND } = require('http-status-codes').StatusCodes;

/* get general info for all platforms */
const getPlatforms = async (_, res) => {

    const queryText = `
        select id, name, release_year, img_url
        from platforms
    `;

    try {
        const result = await query(queryText);

        if (result.length > 0) {
            return res.status(OK)
                .json({
                    platforms: result
                });
        }
    } catch (error) {
        console.error('Could not query platforms.');
        console.error(`query:`, query);
        console.error(error);
    }

    return res.status(NOT_FOUND)
        .json({
            platforms: null,
            error: 'Could not get platform data.'
        });
};

module.exports = getPlatforms;