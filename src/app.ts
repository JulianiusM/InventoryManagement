import createError from 'http-errors';
import express, {NextFunction, Request, Response} from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import session from 'express-session';
import flash from 'express-flash';

import indexRouter from './routes';
import apiRouter from './routes/api';
import usersRouter from './routes/users';
import helpRouter from './routes/help';
import itemsRouter from './routes/items';
import locationsRouter from './routes/locations';
import loansRouter from './routes/loans';
import scanRouter from './routes/scan';
import settings from './modules/settings';
import {handleGenericError} from './middleware/genericErrorHandler';

// Version aus package.json lesen
import {version} from '../package.json';
import {AppDataSource} from "./modules/database/dataSource";
import {Session} from "./modules/database/entities/session/Session";
import {TypeormStore} from "connect-typeorm";

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ensure dataSource is initialized before this
const sessionRepository = AppDataSource.getRepository(Session);

// If behind a proxy (Heroku/NGINX), enable this so secure cookies work:
app.set("trust proxy", 1);

app.use(
    session({
        secret: settings.value.sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            // 1 day (match store TTL below)
            maxAge: 1000 * 60 * 60 * 24,
            secure: process.env.NODE_ENV === "production", // HTTPS only in prod
            sameSite: "lax",
        },
        store: new TypeormStore({
            cleanupLimit: 2,          // prune expired sessions periodically
            limitSubquery: false,
            ttl: 60 * 60 * 24,        // seconds (1 day)
        }).connect(sessionRepository),
    })
);

app.use(flash());

app.use(function (req: Request, res: Response, next: NextFunction) {
    res.locals.user = req.session.user;
    res.locals.guest = req.session.guest;
    res.locals.version = version;
    res.locals.settings = {
        localLoginEnabled: settings.value.localLoginEnabled,
        oidcEnabled: settings.value.oidcEnabled,
        oidcName: settings.value.oidcName,
        rootUrl: settings.value.rootUrl,
        imprintUrl: settings.value.imprintUrl,
        privacyPolicyUrl: settings.value.privacyPolicyUrl,
    };
    next();
});

app.use('/', indexRouter);
app.use('/api', apiRouter);
app.use('/users', usersRouter);
app.use('/help', helpRouter);
app.use('/items', itemsRouter);
app.use('/locations', locationsRouter);
app.use('/loans', loansRouter);
app.use('/scan', scanRouter);

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// catch 404 and forward to error handler
app.use(function (req: Request, res: Response, next: NextFunction) {
    next(createError(404));
});

// error handler
app.use(handleGenericError);

export default app;