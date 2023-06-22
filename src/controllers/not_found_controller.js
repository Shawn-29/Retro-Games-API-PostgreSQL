const { NOT_FOUND } = require('http-status-codes').StatusCodes;

const notFound = (_, res) => {
    res.status(NOT_FOUND)
    .json({
        error: 'Invalid URL.'
    });
};

module.exports = notFound;