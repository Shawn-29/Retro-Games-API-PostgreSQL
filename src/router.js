const router = require('express').Router();

const {
    featuredGames,
    games,
    platform,
    platforms,
    singleGame,
    notFound
} = require('./controllers/index');

router
    .get('/featured', featuredGames)
    .get('/games', games)
    .get('/platform', platform)
    .get('/platforms', platforms)
    .get('/', singleGame)
    .get('/single_game', singleGame);

/* handle invalid routes and http request methods besides get */
router.use(notFound);

module.exports = router;