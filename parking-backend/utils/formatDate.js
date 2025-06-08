const formatDate = (...column_names) => {
    return column_names
        .map(col => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s') AS ${col}`)
        .join(', ');
};

module.exports = formatDate;