const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./config/db");

const app = express();

app.use(cors());
app.use(express.json());

connectDB();

app.use("/api/auth", require("./routes/auth"));
app.use("/api/vehicles", require("./routes/vehicles"));
app.use("/api/instructors", require("./routes/instructors"));
app.use("/api/schedule", require("./routes/schedule"));

app.get("/", (req, res) => {
  res.send("API Автошколи працює!");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
