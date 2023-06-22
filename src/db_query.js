const { Pool } = require('pg');

const format = require('pg-format');

format.config({
    pattern: {
        literal: '?'
    }
});

const dbPool = new Pool({
    host: process.env.HOST,
    user: process.env.USER,
    password: process.env.PASS,
    database: process.env.DB,
    port: process.env.DB_PORT
});

dbPool.on('error', (err) => {
    console.error('Database pool encountered an error!');
    console.error(err);
});

/**
 * @typedef {string} queryText - Query to the PostgreSQL database.
 * @typedef {string[]} queryParams - Values to be inserted a the query via placeholders.
 * @typedef {[queryText, queryParams]} queryPair - A query accompanied by values to be
 * dynamically inserted into the query.
 */

/**
 * @param {queryText} text 
 * @param {queryParams} [params] 
 * @returns 
 */
const query = async (text, params) => {
    return (await dbPool.query(
        Array.isArray(params) ? format(text, ...params) : text
    )).rows;
};

/**
 * Perform multiple queries on the database asynchronously.
 * @param  {...(queryText | queryPair)} queries - A combination of queries with or
 * without parameters to be executed on the database.
 */
const queryMulti = async (...queries) => {
    const client = await dbPool.connect();
    const result = await Promise.all(queries.map(async (q) => {
        return (await client.query(
            Array.isArray(q) ? format(q[0], ...q[1]) : q
        )).rows;
    }));
    client.release();
    return result;
};

/**
 * Perform multiple queries, without parameters, on the database asynchronously.
 * @param  {...queryText} texts
 */
const queryMultiNoParams = async (...texts) => {
    const client = await dbPool.connect();
    const queries = texts.map(async text => {
        return (await client.query(text)).rows;
    });
    const result = await Promise.all(queries);
    client.release();
    return result;
}

module.exports = { query, queryMulti, queryMultiNoParams };