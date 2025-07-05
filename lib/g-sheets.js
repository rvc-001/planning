import { useCallback } from 'react';

const SHEET_ID = "1niKq7rnnWdkH5gWXJIiVJQEsUKgK8qdjLokbo0rmt48";

// MODIFIED: Added an options object to accept a 'headers' parameter
export function useGoogleSheet(sheetName, options = { headers: 1 }) {
  const fetchData = useCallback(async () => {
    // MODIFIED: The headers parameter is now included in the URL
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&headers=${options.headers}&cb=${new Date().getTime()}`;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Network response was not ok for ${sheetName}. Status: ${response.status}`);

      const text = await response.text();
      const match = text.match(/google\.visualization\.Query\.setResponse\((.*)\)/);
      if (!match || !match[1]) {
        throw new Error(`Could not parse the response from Google Sheets for sheet: ${sheetName}. Check sharing settings.`);
      }
      const json = JSON.parse(match[1]);

      if (!json.table) throw new Error(`Invalid data structure from ${sheetName}.`);
      return json.table;
    } catch (err) {
      console.error(`Failed to fetch or parse ${sheetName}:`, err);
      throw err;
    }
  }, [sheetName, options.headers]); // Added options.headers to the dependency array

  return { fetchData };
}

export function parseGvizDate(gvizDateString) {
    if (!gvizDateString || typeof gvizDateString !== 'string' || !gvizDateString.startsWith("Date(")) {
        return null;
    }
    const numbers = gvizDateString.match(/\d+/g);
    if (!numbers || numbers.length < 3) {
        return null;
    }
    const [year, month, day, hours = 0, minutes = 0, seconds = 0] = numbers.map(Number);
    const date = new Date(year, month, day, hours, minutes, seconds);
    return isNaN(date.getTime()) ? null : date;
}
