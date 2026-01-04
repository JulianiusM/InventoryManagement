import express, {Request, Response} from 'express';

import * as userController from "../controller/userController";
import * as itemService from "../modules/database/services/ItemService";
import * as loanService from "../modules/database/services/LoanService";
import * as locationService from "../modules/database/services/LocationService";
import renderer from "../modules/renderer";
import {asyncHandler} from '../modules/lib/asyncHandler';
import settings from "../modules/settings";
import {ExpectedError} from "../modules/lib/errors";

const app = express.Router();

/* GET users listing. */
app.get('/', asyncHandler((req: Request, res: Response) => {
    res.redirect('/users/dashboard');
}));

// User dashboard - overview of user's inventory
app.get('/dashboard', asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.user) {
        return res.redirect('/users/login');
    }
    const ownerId = req.session.user.id;
    
    // Get summary data for the dashboard
    const items = await itemService.getAllItems(ownerId);
    const locations = await locationService.getAllLocations(ownerId);
    const activeLoans = await loanService.getActiveLoans(ownerId);
    const overdueLoans = await loanService.getOverdueLoans(ownerId);
    
    renderer.renderWithData(res, 'users/dashboard', {
        itemCount: items.length,
        locationCount: locations.length,
        activeLoanCount: activeLoans.length,
        overdueLoanCount: overdueLoans.length,
        recentItems: items.slice(0, 5),
        activeLoans: activeLoans.slice(0, 5),
    });
}));

// Managed items dashboard (placeholder for future admin functionality)
app.get('/manage-dashboard', asyncHandler(async (req: Request, res: Response) => {
    if (!req.session.user) {
        return res.redirect('/users/login');
    }
    // For now, redirect to regular dashboard
    res.redirect('/users/dashboard');
}));

// Registrierung von Benutzern
app.get('/register', asyncHandler((req: Request, res: Response) => {
    if (!settings.value.localLoginEnabled) return res.redirect("/users/oidc/login");
    renderer.render(res, 'users/register');  // Zeige das Registrierungsformular an
}));

app.post('/register', asyncHandler(async (req: Request, res: Response) => {
    if (!settings.value.localLoginEnabled) throw new ExpectedError('Login is not enabled!', 'error', 500);
    await userController.registerUser(req.body);
    renderer.renderInfo(res, 'Account successfully registered. Please activate it using the link sent to your email.');
}));

// Login-Funktionalität
app.get('/login', asyncHandler((req: Request, res: Response) => {
    if (!settings.value.localLoginEnabled) return res.redirect("/users/oidc/login");
    renderer.render(res, 'users/login');  // Zeige das Login-Formular an
}));

app.post('/login', asyncHandler(async (req: Request, res: Response) => {
    if (!settings.value.localLoginEnabled) throw new ExpectedError('Login is not enabled!', 'error', 500);
    await userController.loginUser(req.body, req.session);
    req.flash('success', 'Login successful');
    res.redirect('/users/dashboard');  // Weiterleitung nach dem Login
}));

// Logout
app.get('/logout', asyncHandler(async (req: Request, res: Response) => {
    const redirect = await userController.logoutUserOidc(req.session);
    res.redirect(redirect);
}));

// Passwort zurücksetzen: E-Mail mit Link senden
app.get('/forgot-password', asyncHandler((req: Request, res: Response) => {
    if (!settings.value.localLoginEnabled) throw new ExpectedError('Login is not enabled!', 'error', 500);
    renderer.render(res, 'users/forgot-password.pug');  // Zeige das Formular zum Zurücksetzen des Passworts
}));

app.post('/forgot-password', asyncHandler(async (req: Request, res: Response) => {
    if (!settings.value.localLoginEnabled) throw new ExpectedError('Login is not enabled!', 'error', 500);
    await userController.sendPasswordForgotMail(req.body.username);
    renderer.renderSuccess(res, 'A link has been sent to the email corresponding to this account (if present).')
}));

// Passwort zurücksetzen: Formular anzeigen
app.get('/reset-password/:token', asyncHandler(async (req: Request, res: Response) => {
    if (!settings.value.localLoginEnabled) throw new ExpectedError('Login is not enabled!', 'error', 500);
    const token = req.params.token;
    await userController.checkPasswordForgotToken(token);
    renderer.renderWithData(res, 'users/reset-password', {token});  // Zeige das Passwort-Reset-Formular an
}));

// Passwort zurücksetzen: Neues Passwort speichern
app.post('/reset-password/:token', asyncHandler(async (req: Request, res: Response) => {
    if (!settings.value.localLoginEnabled) throw new ExpectedError('Login is not enabled!', 'error', 500);
    await userController.resetPassword(req.params.token, req.body);
    renderer.renderSuccess(res, 'Your password has been successfully reset')
}));

// Aktivierungs-Link
app.get('/activate/:token', asyncHandler(async (req: Request, res: Response) => {
    if (!settings.value.localLoginEnabled) throw new ExpectedError('Login is not enabled!', 'error', 500);
    await userController.activateAccount(req.params.token);
    renderer.renderSuccess(res, 'Your account has been activated. You can log in now.')
}));

app.get('/oidc/login', asyncHandler(async (req: Request, res: Response) => {
    if (!settings.value.oidcEnabled) throw new ExpectedError('OIDC provider is not enabled!', 'error', 500);
    const redirect = await userController.loginUserWithOidc(req.session);
    res.redirect(redirect);
}));

app.get('/oidc/callback', asyncHandler(async (req: Request, res: Response) => {
    if (!settings.value.oidcEnabled) throw new ExpectedError('OIDC provider is not enabled!', 'error', 500);
    await userController.loginUserWithOidcCallback(req);
    res.redirect('/users/dashboard'); // or wherever you want to land post-login
}));

export default app;
