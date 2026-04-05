function getMonthDateRange(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

module.exports = {
  getMonthDateRange,
};
