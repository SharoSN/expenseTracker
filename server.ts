require("dotenv").config();

import express, { Request, Response, NextFunction } from "express";

const bodyParser = require("body-parser");
const session = require("express-session");

const { Configuration, PlaidApi, PlaidEnvironments } = require("plaid");

const app = express();
const port = 8080;

app.use(
  // FOR DEMO PURPOSES ONLY
  // Use an actual secret key in production
  session({ secret: "bosco", saveUninitialized: true, resave: true }),
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Configuration for the Plaid client
const config = new Configuration({
  basePath: PlaidEnvironments["sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": "67fbed365090100023459e28",
      "PLAID-SECRET": "4ca10094b21045827c081c02c80a31",
    },
  },
});

const client = new PlaidApi(config);

app.post("/api/create_link_token", async (req: Request, res: Response) => {
  try {
    const response = await client.linkTokenCreate({
      user: {
        client_user_id: "unique_user_id", // You can use your user ID here
      },
      client_name: "Velora AI",
      products: ["auth", "transactions"],
      country_codes: ["US"],
      language: "en",
    });

    res.json({ link_token: response.data.link_token }); // ✅ Send JSON
  } catch (error) {
    console.error("Plaid link token error:", error);
    res.status(500).json({ error: "Failed to create link token" }); // ✅ Also return JSON error
  }
});

// Fetches balance data using the Node client library for Plaid

app.listen(port, () => {
  console.log(`Backend server is running on port ${port}...`);
});
