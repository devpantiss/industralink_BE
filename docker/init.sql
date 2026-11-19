-- Runs once, when the Docker volume is first created.
-- A separate database for automated tests, so tests never touch dev data.
CREATE DATABASE industrialink_test;
