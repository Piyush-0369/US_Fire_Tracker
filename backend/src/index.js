import express from "express";
import app from "./app.js";
import "../src/db/db_index.js";
import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT ;

app.listen(PORT,()=>console.log(`Server running on port ${PORT} \nlocalhost: https://localhost:${PORT}`));

