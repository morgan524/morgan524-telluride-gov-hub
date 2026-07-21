/* ============================================================
   Livable Telluride — weather card (NWS Grand Junction, free API).
   Any page drops <div id="lt-weather"></div> and loads this file.
   Gridpoint GJT/116,49 = Telluride (precomputed from /points/…).
   Client-side fetch, 30-min sessionStorage cache, silent on failure
   (weather is garnish — it must never break a page).
   ============================================================ */
(function () {
  'use strict';
  var slot = document.getElementById('lt-weather');
  if (!slot) return;
  var FORECAST = 'https://api.weather.gov/gridpoints/GJT/116,49/forecast';
  var HOURLY = 'https://api.weather.gov/gridpoints/GJT/116,49/forecast/hourly';
  var CACHE_KEY = 'lt-weather-v1';

  function icon(short, isDay) {
    var s = (short || '').toLowerCase();
    if (/thunder/.test(s)) return '⛈️';
    if (/snow|flurr/.test(s)) return '🌨️';
    if (/rain|shower|drizzle/.test(s)) return '🌧️';
    if (/fog|haze|smoke/.test(s)) return '🌫️';
    if (/partly|mostly sunny|mostly clear/.test(s)) return isDay ? '🌤️' : '🌙';
    if (/cloud|overcast/.test(s)) return '☁️';
    if (/wind/.test(s)) return '💨';
    return isDay ? '☀️' : '🌙';
  }

  function dayLabel(p, i) {
    if (i === 0) return 'Today';
    if (i === 1) return 'Tomorrow';
    return new Date(p.startTime).toLocaleDateString('en-US', { weekday: 'short' });
  }

  function render(data) {
    var now = data.now, days = data.days;
    var cards = days.map(function (d, i) {
      return '<div class="ltw-day"><div class="ltw-d">' + d.label + '</div>' +
        '<div class="ltw-i">' + d.icon + '</div>' +
        '<div class="ltw-t"><strong>' + d.hi + '°</strong> ' + (d.lo !== null ? d.lo + '°' : '') + '</div>' +
        (d.precip ? '<div class="ltw-p">' + d.precip + '% 💧</div>' : '<div class="ltw-p">&nbsp;</div>') + '</div>';
    }).join('');
    slot.innerHTML =
      '<div class="ltw card"><div class="ltw-now">' +
      '<div class="ltw-big-i">' + now.icon + '</div><div>' +
      '<div class="ltw-k">Telluride &middot; Now</div>' +
      '<div class="ltw-temp">' + now.temp + '&deg;F</div>' +
      '<div class="ltw-cond">' + now.short + '</div>' +
      '<div class="ltw-meta">' + now.wind + ' wind' + (now.rh !== null ? ' &middot; ' + now.rh + '% humidity' : '') + '</div>' +
      '</div></div><div class="ltw-days">' + cards + '</div>' +
      '<div class="ltw-src">Data: NWS Grand Junction</div></div>';
  }

  try {
    var cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.t < 30 * 60000) { render(cached.data); return; }
  } catch (e) {}

  Promise.all([
    fetch(FORECAST).then(function (r) { return r.json(); }),
    fetch(HOURLY).then(function (r) { return r.json(); })
  ]).then(function (res) {
    var periods = res[0].properties.periods || [];
    var hour = (res[1].properties.periods || [])[0] || {};
    // Fold day/night periods into calendar days (hi from day, lo from night).
    var days = [], byDay = {};
    periods.forEach(function (p) {
      var key = p.startTime.slice(0, 10);
      if (p.isDaytime) {
        byDay[key] = { label: '', icon: icon(p.shortForecast, true), hi: p.temperature, lo: null,
          precip: (p.probabilityOfPrecipitation || {}).value || 0, startTime: p.startTime };
        days.push(byDay[key]);
      } else if (byDay[key]) {
        byDay[key].lo = p.temperature;
      } else if (days.length && days[days.length - 1].lo === null) {
        days[days.length - 1].lo = p.temperature;
      }
    });
    days = days.slice(0, 5);
    days.forEach(function (d, i) { d.label = dayLabel(d, i); });
    var data = {
      now: {
        temp: hour.temperature, short: hour.shortForecast || '',
        icon: icon(hour.shortForecast, hour.isDaytime !== false),
        wind: (hour.windSpeed || '') + ' ' + (hour.windDirection || ''),
        rh: hour.relativeHumidity ? hour.relativeHumidity.value : null
      },
      days: days
    };
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) {}
    render(data);
  }).catch(function (e) { console.warn('[lt-weather] unavailable:', e); });
})();
