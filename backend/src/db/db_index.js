import dotenv from "dotenv"
import pkg from "pg";
dotenv.config();

const {Pool}=pkg;

const pool = new Pool({
    user:process.env.DB_USER,
    host: "localhost",
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT,
});

pool.connect()
    .then(()=> console.log("Connected to PostgreSQL"))
    .catch(err=> console.log("DB connection error :", err.stack));

export default pool;