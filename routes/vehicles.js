const express = require("express");
const router = express.Router();
const Vehicle = require("../models/Vehicle");

router.get("/", async (req, res) => {
  try {
    const vehicles = await Vehicle.find({});
    res.status(200).json({ success: true, vehicles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
