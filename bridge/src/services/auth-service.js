/**
 * Auth Service
 *
 * Validates API key from Authorization header.
 * Simple Bearer token validation against configured BRIDGE_API_KEY.
 */

class AuthService {
  /**
   * @param {string} apiKey - Expected API key
   */
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('API key is required for AuthService');
    }
    this._apiKey = apiKey;
  }

  /**
   * Express middleware to validate Bearer token.
   * @returns {Function} Express middleware
   */
  middleware() {
    return (req, res, next) => {
      // Skip auth for health check
      if (req.path === '/health') return next();

      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header required' });
      }

      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' });
      }

      if (parts[1] !== this._apiKey) {
        return res.status(403).json({ error: 'Invalid API key' });
      }

      next();
    };
  }

  /**
   * Validate a WebSocket connection upgrade request.
   * @param {string} token - Token from query string or header
   * @returns {boolean}
   */
  validateWsToken(token) {
    return token === this._apiKey;
  }
}

module.exports = { AuthService };
