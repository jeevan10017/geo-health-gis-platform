/**
 * Converts a flat array of database rows (with a 'geometry' column)
 * into a GeoJSON FeatureCollection object.
 * @param {Array} rows - Array of rows from the database.
 * @returns {Object} A GeoJSON FeatureCollection.
 */
exports.formatToGeoJSON = (rows) => {
  const features = rows.map(row => {
    const geometry = JSON.parse(row.geometry);
    const properties = { ...row };
    delete properties.geometry;

    return {
      type: 'Feature',
      geometry: geometry,
      properties: properties,
    };
  });

  return {
    type: 'FeatureCollection',
    features: features,
  };
};