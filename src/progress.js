function showProgress(progress, text = "") {
  if (process.stdout.cursorTo) {
    process.stdout.cursorTo(0);
  } else {
    process.stdout.write('\r');
  }
  process.stdout.write(
    `${text}... ${
      progress === 100 ? "\x1b[32mCompleted\x1b[0m" : `${progress.toFixed(0)}%`
    }`
  );
}

module.exports = { showProgress };
