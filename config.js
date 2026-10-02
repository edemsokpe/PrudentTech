// Where the FastAPI backend lives.
// - "" (empty) = same address as the website. Use this when you run the site through FastAPI
//   (uvicorn app.main:app) which serves both the website and the API.
// - If the website is hosted somewhere else, put the API address here, e.g. "https://api.yourdomain.com"
//   (and add the website address to CORS_ORIGINS in backend/.env).
window.API_BASE = "";
