/**
 * Protection du domaine staging par mot de passe
 * Header X-Staging-Token ou ?token= dans l'URL
 * Config : STAGING_PASSWORD dans les variables Vercel (Preview)
 */

import { isStaging } from '../lib/env.js';

export function requireAuthStaging(req, res, next) {
  if (!isStaging) return next();

  const password = process.env.STAGING_PASSWORD;
  if (!password) return next();

  const token = req.headers['x-staging-token'] || req.query.token;
  if (token === password) return next();

  res.setHeader('WWW-Authenticate', 'Bearer realm="Staging"');
  res.status(401).json({
    error: 'Accès staging protégé',
    message: 'Fournir X-Staging-Token ou ?token= dans l\'URL',
  });
}
