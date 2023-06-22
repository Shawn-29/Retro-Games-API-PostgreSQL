const app = require('express')();

const { TOO_MANY_REQUESTS } = require('http-status-codes').StatusCodes;

/* get local environment variables if this app is run in development mode */
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: '.env' });
}

app.set('port', process.env.PORT || 3002);

/* middleware */
app.use((_, res, next) => {
    res.header("Access-Control-Allow-Origin", process.env.HOST_URL);
    next();
});
app.use(require('helmet')());
app.use(require('express-rate-limit')({
    windowMs: 60000,
    max: 120,
    legacyHeaders: false,
    handler(_, res) {
        res.status(TOO_MANY_REQUESTS)
            .json({
                error: 'Request limit exceeded.'
            });
    }
}));
app.use(require('compression')());

app.use('/', require('./src/router'));

/* app entry point */
(async () => {

    /* start up the server to handle API requests */
    app.listen(app.get('port'), () => {
        console.log(`Server running on port ${app.get('port')}.`);
    });
})();