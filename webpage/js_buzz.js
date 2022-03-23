
let animating = false;
let focused_marker = undefined;
let infobox_marker = undefined;
const map = L.map('map', {'worldCopyJump': true});
map.doubleClickZoom.disable();
// Set Default view to South America as requested by Hanan
const default_camera_bounding_box = [[5.44, -73.83], [-34.67, -34.98]];
map.fitBounds(default_camera_bounding_box);

const CIRCLE_TYPES = {
		confirmed: 0,
		deaths: 1,
		recoveries: 2,
		active: 3,
		vaccine: 4,
		incidence: 5,
		mortality: 6,
		recoveryrate: 7.
};

function selectMarkerByName(name) {
  if (jhuLayer && jhuLayer.markers._gridClusters) {
    const zoomLevel = map.getZoom();
    const gridClustered = jhuLayer.markers._gridClusters[zoomLevel];
    const gridUnclustered = jhuLayer.markers._gridUnclustered[zoomLevel];
    const marker = {m: undefined};
    gridClustered.eachObject(function (e) {
      if (e.getAllChildMarkers().some((m) => m.name === name)) {
        this.m = e;
      }
    }, marker);
    gridUnclustered.eachObject(function (e) {
      if (e.name === name) {
        this.m = e;
      }
    }, marker);
    infobox.updateInfoboxByMarker(marker.m);
    updateFocusLocation(marker.m);
  }
}

map.on('click', function (e) { updateFocusLocation(getClosestMarker(e.latlng)); });
map.on('dblclick', function (e) { map.zoomIn(1); });
map.on('contextmenu',  function (e) { map.zoomOut(1); });
map.on('mouseout', function (e) { infobox.hide(); });
map.on('zoomend', function (e) { updateFocusLocation(getClosestMarker(e.target._lastCenter));});

map.on('move', function (e) { jhuLayer.plotData(displayStartDate, displayEndDate); });


map.on('mousemove', function (e) {
  infobox.show();
  const map_bounds = document.getElementById('map').getBoundingClientRect();
  const x = Math.round(e.containerPoint.x);
  const y = Math.round(e.containerPoint.y);
  const info_bounds = infobox._div.getBoundingClientRect();
  infobox._div.style.left = (x + info_bounds.width > map_bounds.width) ? `${map_bounds.width - info_bounds.width}px` : `${x}px`;
  infobox._div.style.top = (y + info_bounds.height > map_bounds.height) ? `${map_bounds.height - info_bounds.height}px` : `${y}px`;
  infobox.updateInfoboxByMarker(getClosestMarker(e.latlng));
});


function percentValue(confirmed, population) {
  if (population == 0) return 0;
  return confirmed * 100000.0 / population;
}

function percent(confirmed, population) {
  if (population == 0) return 0;
  return (confirmed * 100000 / population).toFixed(2);
}

function percent2Value(deaths, confirmed) {
  if (confirmed == 0) return 0;
  return deaths * 100 / confirmed;
}

function percent2(deaths, confirmed) {
  if (confirmed == 0) return "0.00%";
  return `${(deaths * 100 / confirmed).toFixed(2)}%`;
}

function getClosestMarker(latlng) {
  if (jhuLayer && jhuLayer.markers._gridClusters) {
    const zoomLevel = map.getZoom();
    const gridClustered = jhuLayer.markers._gridClusters[zoomLevel];
    const gridUnclustered = jhuLayer.markers._gridUnclustered[zoomLevel];
    const point = map.project(latlng);
    const minDist = {marker: undefined, dist: undefined};
    gridClustered.eachObject(function (e) {
      const dist = gridClustered._sqDist(gridClustered._objectPoint[L.Util.stamp(e)], point);
      if (!this.dist || dist < this.dist) {
        this.marker = e;
        this.dist = dist;
      }
    }, minDist)
    gridUnclustered.eachObject(function (e) {
      const dist = gridUnclustered._sqDist(gridUnclustered._objectPoint[L.Util.stamp(e)], point);
      if (!this.dist || dist < this.dist) {
        this.marker = e;
        this.dist = dist;
      }
    }, minDist)
    if (minDist.marker) {
      return minDist.marker;
    } else {
      console.log('no marker found');
    }
  } else {
    console.log('cluster not initialized');
  }

}

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}' + (L.Browser.retina ? '@2x.png' : '.png'), {
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20,
  minZoom: 0
}).addTo(map);

let infobox = {};
infobox._div = document.getElementById("info");
infobox.update = function (confirmed, deaths, recoveries, vaccines, active, placenames, population) {
  placenames = placenamesString(placenames);
  this._div.innerHTML = (placenames !== undefined ? "<b>" + placenames + "</b><br>" : "") +
      "Population: " + population + "<br>" +
      "Confirmed: " + normalizeCount(confirmed) + "<br>" +
      "Deaths: " + normalizeCount(deaths) + "<br>" +
      "Recoveries:" + normalizeCount(recoveries) + "<br>" +
      "Vaccines:" + normalizeCount(vaccines) + "<br>" +
      "Active:" + normalizeCount(active) + "<br>" +
      "Incidence Rate: " + percent(confirmed, population) + "<br>" +
      "Mortality Rate: " + percent2(deaths, confirmed) + "<br>" +
      "Recovery Rate: " + percent2(recoveries, deaths * 1.0 + recoveries) + "<br>";
};

infobox.hide = function () { this._div.style.visibility ='hidden'; }
infobox.show = function () { this._div.style.visibility ='visible'; }
infobox.updateInfoboxByMarker = function (marker) {
  if (marker) {
    if (infobox_marker && infobox_marker._icon) {
      infobox_marker._icon.classList.remove('selected');
    }
    const [confirmed, deaths, recoveries, vaccines, active, names, population] = getStatisticByMarker(marker);
    if (marker._icon) {
      marker._icon.classList.add('selected');
    }
    infobox.update(confirmed, deaths, recoveries, vaccines, active, names, population);
    infobox_marker = marker;
  }
}


function placenamesString(placenames) {
  if (Array.isArray(placenames)) {
    let truncated = false;
    placenames = placenames.reduce(function (names_str, next) {
      const new_names_str = `${names_str}${next}; `;
      if (new_names_str.length <= 32) {
        return new_names_str;
      } else {
        truncated = true;
        return names_str;
      }
    }, "");
    placenames = (truncated) ? `${placenames}etc.` : placenames.substring(0, placenames.length - 2);
  }
  return placenames;
}

function compare(infoName, a, b) {
  var delta = b * 1.0 - a;
  if (delta < -0.0001) {
    document.getElementById(infoName).style.fontWeight = 'bold';
    document.getElementById(infoName + "_2").style.fontWeight = 'normal';
  }
  else if (delta > 0.0001) {
    document.getElementById(infoName).style.fontWeight = 'normal';
    document.getElementById(infoName + "_2").style.fontWeight = 'bold';
  }
  else {
    document.getElementById(infoName).style.fontWeight = 'normal';
    document.getElementById(infoName + "_2").style.fontWeight = 'normal';
  }
}

function updateFocusLocation(marker) {
  if (marker == undefined) return;
  focused_marker = marker;
  updateSidebar();
}

function updateSidebar() {
  if (displayStartDate != undefined) {
    const [baselineConfirmed, baselineDeaths, baselineRecoveries, baselineVaccines, baselineActive, baselinePlacenames, baselinePopulation] = getBaselineStatistic();
    document.getElementById("sidebar_confirmed_2").innerText = normalizeCount(baselineConfirmed);
    document.getElementById("sidebar_deaths_2").innerText = normalizeCount(baselineDeaths);
    document.getElementById("sidebar_recoveries_2").innerText = normalizeCount(baselineRecoveries);
    document.getElementById("sidebar_vaccines_2").innerText = normalizeCount(baselineVaccines);
    document.getElementById("sidebar_active_2").innerText = normalizeCount(baselineActive);
    document.getElementById("sidebar_location_2").innerText = placenamesString(baselinePlacenames);
    document.getElementById("sidebar_population_2").innerText = baselinePopulation;
    document.getElementById("sidebar_incidence_2").innerText = percent(baselineConfirmed, baselinePopulation);
    document.getElementById("sidebar_mortality_2").innerText = percent2(baselineDeaths, baselineConfirmed);
    document.getElementById("sidebar_recoveryrate_2").innerText = percent2(baselineRecoveries, baselineDeaths * 1.0 + baselineRecoveries);
    if (focused_marker != undefined) {
      const [focusConfirmed, focusDeaths, focusRecoveries, focusVaccines, focusActive, focusPlacenames, focusPopulation] = getStatisticByMarker(focused_marker);
      document.getElementById("sidebar_confirmed").innerText = normalizeCount(focusConfirmed);
      document.getElementById("sidebar_deaths").innerText = normalizeCount(focusDeaths);
      document.getElementById("sidebar_recoveries").innerText = normalizeCount(focusRecoveries);
      document.getElementById("sidebar_vaccines").innerText = normalizeCount(focusVaccines);
      document.getElementById("sidebar_active").innerText = normalizeCount(focusActive);
      document.getElementById("sidebar_location").innerText = placenamesString(focusPlacenames);
      document.getElementById("sidebar_population").innerText = focusPopulation;
      document.getElementById("sidebar_incidence").innerText = percent(focusConfirmed, focusPopulation);
      document.getElementById("sidebar_mortality").innerText = percent2(focusDeaths, focusConfirmed);
      document.getElementById("sidebar_recoveryrate").innerText = percent2(focusRecoveries, focusDeaths * 1.0 + focusRecoveries);
      compare("sidebar_confirmed", focusConfirmed, baselineConfirmed);
      compare("sidebar_deaths", focusDeaths, baselineDeaths);
      compare("sidebar_recoveries", focusRecoveries, baselineRecoveries);
      compare("sidebar_active", focusActive, baselineActive);
      compare("sidebar_population", focusPopulation, baselinePopulation);
      compare("sidebar_incidence", percentValue(focusConfirmed, focusPopulation), percentValue(baselineConfirmed, baselinePopulation));
      compare("sidebar_mortality", percent2Value(focusDeaths, focusConfirmed), percent2Value(baselineDeaths, baselineConfirmed));
      compare("sidebar_recoveryrate", percent2Value(focusRecoveries, focusDeaths * 1.0 + focusRecoveries), percent2Value(baselineRecoveries, baselineDeaths * 1.0 + baselineRecoveries));
    }
  }
}


function getStatisticByMarker(marker) {
  let confirmed, deaths, recoveries, vaccines, active, names, population;
  if (marker) {
    if (marker.getAllChildMarkers) {
      confirmed = marker.getAllChildMarkers().reduce((a, v) => a + v.confirmed, 0);
      deaths = marker.getAllChildMarkers().reduce((a, v) => a + v.deaths, 0);
      recoveries = marker.getAllChildMarkers().reduce((a, v) => a + v.recoveries, 0);
      vaccines = marker.getAllChildMarkers().reduce((a, v) => a + v.vaccines, 0);
      active = marker.getAllChildMarkers().reduce((a, v) => a + v.active, 0);
      names = marker.getAllChildMarkers().slice().filter((e) => e.name === 'Brazil' || e.confirmed >= 0).sort((a, b) => a.confirmed - b.confirmed).reverse().map((v) => v.name);
      population = marker.getAllChildMarkers().reduce((a, v) => a + v.population, 0);
    } else {
      confirmed = marker.confirmed;
      deaths = marker.deaths;
      recoveries = marker.recoveries;
      vaccines = marker.vaccines;
      active = marker.active;
      names = marker.name;
      population = marker.population;
    }
  }
  return [confirmed, deaths, recoveries, vaccines, active, names, population];
}



const country_select = document.getElementById("country_select");
const state_select = document.getElementById("state_select");
const county_select = document.getElementById("county_select");

const sorted_options = Object.entries(bounding_boxes).sort(function (a, b) {
  return a[1][0].localeCompare(b[1][0])
});
const sorted_options_2 = Object.entries(bounding_boxes_2).sort(function (a, b) {
  return a[1][0].localeCompare(b[1][0])
});

for (let e of sorted_options) {
  const key = e[0];
  const label = e[1][0];
  const option = document.createElement("option");
  const textnode = document.createTextNode(label);
  option.appendChild(textnode);
  option.value = key;
  if (label === 'Brazil') {
    option.selected = true;
  }
  country_select.appendChild(option);
}

const option1 = document.createElement("option");
const textnode1 = document.createTextNode("All");
option1.appendChild(textnode1);
state_select.appendChild(option1);

const option2 = document.createElement("option");
const textnode2 = document.createTextNode("All");
option2.appendChild(textnode2);
county_select.appendChild(option2);

var country_dict = new Map();
var state_dict = new Map();
var state_bb_dict = new Map();
var county_bb_dict = new Map();

for (let e of jhuData) {
  // L_1: Country/Region
  // L_2: Province/State
  // L_3: Admin2
  if (country_dict[e.l_1] == undefined) {
    country_dict[e.l_1] = [];
  }
  if (e.l_2 != "") {
    if (state_dict[e.l_2] == undefined) {
      country_dict[e.l_1].push(e.l_2);
      state_dict[e.l_2] = [];
      if (e.l_1 == "United States") {
        const bb = bounding_boxes_2[e.l_2][1];
        const name = sorted_options_2.find(x => x[0] == e.l_2)[1][0];
        if (name != undefined) {
          state_bb_dict[e.l_2] = [[bb[1], bb[0]], [bb[3], bb[2]]];
        }
        else {
          state_bb_dict[e.l_2] = [[e.lat * 1.0 + 1.6, e.lng - 1.6], [e.lat -  1.6, e.lng * 1.0 + 1.6]];
        }
      }
      else {
        state_bb_dict[e.l_2] = [[e.lat * 1.0 + 1.6, e.lng - 1.6], [e.lat -  1.6, e.lng * 1.0 + 1.6]];
      }
    }
  }
  if (e.l_3 != "") {
    if (county_bb_dict[e.l_3] == undefined) {
      state_dict[e.l_2].push(e.l_3);
      county_bb_dict[e.l_3] = [[e.lat * 1.0 + 0.4, e.lng - 0.4], [e.lat -  0.4, e.lng * 1.0 + 0.4]];
    }
  }
}

const country_select_2 = document.getElementById("country_select_2");
for (let e of sorted_options) {
  const key = e[0];
  const label = e[1][0];
  const option = document.createElement("option");
  const textnode = document.createTextNode(label);
  option.appendChild(textnode);
  option.value = key;
  if (label === 'Brazil') {
    option.selected = true;
  }
  country_select_2.appendChild(option);
}

let dataEndDate;
let dataStartDate;
let displayStartDate;
let displayEndDate;

selectCountry("BR");

let animateWindow = 24*60 * parseInt(document.getElementById('animate_window').value);
let animateStep = 24 * 60;
let animateSpeed = 100;
let dailyRate = document.getElementById("daily_rate").checked;
let animation_paused = false;

const VIEW_TYPES = {
	DEFAULT: 0,
	LINEAR: 1,
	LOG: 2,
	FLANNERY: 3,
	ABSOLUTE: 4,
	RATE: 5,
};
let current_view_type = VIEW_TYPES.DEFAULT;


let tempAnimateWindow = 7 * 60 * 24;
let animate_window_max = document.getElementById("animate_max").checked
if(animate_window_max) {
  tempAnimateWindow = animateWindow;
  document.getElementById('animate_window').disabled = true;
}
let totalAnimation = document.getElementById("total_animation").checked;
if(totalAnimation) {
  document.getElementById('animate_window').disabled = true;
  animateWindow = 0;
}

const slider_range = $("#slider-range");
slider_range.slider({
  range: true,
  min: 0,
  max: 100,
  values: [0, animateWindow],
  slide: function (event, ui) {
    if (totalAnimation) {
      if (ui.handleIndex == 1) {
        const displayStartMins = dateToEpochMins(dataStartDate);
        const displayEndMins = ui.values[1];
        setDisplayedDateRange(displayStartMins, displayEndMins);
      }
      else {
        slider_range.slider("values", [displayStartMins, displayEndMins]);
      }
    }
    else {
      let displayStartMins = 0;
      let displayEndMins = 0;
      switch(ui.handleIndex) {
        case 0:
          displayStartMins = ui.values[0];
          displayEndMins = ui.values[0] + animateWindow;
          if (ui.values[0] + animateWindow <= dateToEpochMins(dataEndDate)) {
            setDisplayedDateRange(displayStartMins, displayEndMins);
            animateWindow = displayEndMins - displayStartMins;
            document.getElementById('animate_window').value = Math.floor((displayEndMins - displayStartMins)/(60*24));
          }
          else {
            slider_range.slider("values", [dateToEpochMins(dataEndDate) - animateWindow, dateToEpochMins(dataEndDate)]);
            animateWindow = displayEndMins - displayStartMins;
            document.getElementById('animate_window').value = Math.floor((displayEndMins - displayStartMins)/(60*24));
          }
          break;
        case 1:
          displayStartMins = ui.values[0];
          displayEndMins = ui.values[1];
          animateWindow = displayEndMins - displayStartMins;
          document.getElementById('animate_window').value = Math.floor((displayEndMins - displayStartMins)/(60*24));
          if (animate_window_max) {
            toggleAnimateMax();
            document.getElementById('animate_max').checked = false;
          }
          setDisplayedDateRange(displayStartMins, displayEndMins);
          /*
          if (ui.values[1] - animateWindow >= dateToEpochMins(dataStartDate)) {
            const displayStartMins = ui.values[1] - animateWindow;
            const displayEndMins = ui.values[1];
            setDisplayedDateRange(displayStartMins, displayEndMins);
            animateWindow = displayEndMins - displayStartMins;
            document.getElementById('animate_window').value = Math.floor((displayEndMins - displayStartMins)/(60*24));
          }
          else {
            slider_range.slider("values", [dateToEpochMins(dataStartDate), dateToEpochMins(dataStartDate) + animateWindow]);
            animateWindow = displayEndMins - displayStartMins;
            document.getElementById('animate_window').value = Math.floor((displayEndMins - displayStartMins)/(60*24));
          }
          */
          break;
      }
    }
  }
});

function calcScale(value) {
  const maxScale = 8.0;
  const minScale = 0.01;
  if (value <= 50) {
    return value * (1 - minScale) / 50 + minScale;
  }
  else {
    return value * (maxScale - 1) / 50 + 2 - maxScale;
  }
}

const mortality_slider = document.getElementById('mortality_size');
mortality_slider.oninput = function() {
  mortality_scale = calcScale(this.value);
  setDisplayedDateRange(displayStartDate, displayEndDate);
}
let mortality_scale = 1;

const incidence_slider = document.getElementById('incidence_size');
incidence_slider.oninput = function() {
  incidence_scale = calcScale(this.value);
  setDisplayedDateRange(displayStartDate, displayEndDate);
}
let incidence_scale = 1;

const confirmed_slider = document.getElementById('confirmed_size');
confirmed_slider.oninput = function() {
  confirmed_scale = calcScale(this.value);
  setDisplayedDateRange(displayStartDate, displayEndDate);
}
let confirmed_scale = 1;

const deaths_slider = document.getElementById('deaths_size');
deaths_slider.oninput = function() {
  deaths_scale = calcScale(this.value);
  setDisplayedDateRange(displayStartDate, displayEndDate);
}
let deaths_scale = 1;

const recoveries_slider = document.getElementById('recoveries_size');
recoveries_slider.oninput = function() {
  recoveries_scale = calcScale(this.value);
  setDisplayedDateRange(displayStartDate, displayEndDate);
}
let recoveries_scale = 1;

const vaccine_slider = document.getElementById('vaccine_size');
vaccine_slider.oninput = function() {
  vaccine_scale = calcScale(this.value);
  setDisplayedDateRange(displayStartDate, displayEndDate);
}
let vaccine_scale = 0.1;

const active_slider = document.getElementById('active_size');
active_slider.oninput = function() {
  active_scale = calcScale(this.value);
  setDisplayedDateRange(displayStartDate, displayEndDate);
}
let active_scale = 1;

const recoveryrate_slider = document.getElementById('recoveryrate_size');
recoveryrate_slider.oninput = function() {
  recoveryrate_scale = calcScale(this.value);
  setDisplayedDateRange(displayStartDate, displayEndDate);
}
let recoveryrate_scale = 1;

function resetScale() {
  document.getElementById("mortality_size").value =
  document.getElementById("incidence_size").value =
  document.getElementById("confirmed_size").value =
  document.getElementById("deaths_size").value =
  document.getElementById("recoveries_size").value =
  document.getElementById("active_size").value =
  document.getElementById("recoveryrate_size").value = "50";
  document.getElementById("vaccine_size").value = "5";
  mortality_scale = incidence_scale = deaths_scale = confirmed_scale = recoveries_scale = active_scale = 1;
	vaccine_scale = 0.1;
  setDisplayedDateRange(displayStartDate, displayEndDate);
}

const cluster_radius_slider = document.getElementById('cluster_radius');
cluster_radius_slider.oninput = function() {
  jhuLayer.markers.clearLayers();
  jhuLayer.markers.addLayers(jhuLayer.timeSeriesMarkers);
  jhuLayer.plotData(displayStartDate, displayEndDate);
}
class JHUDataLayer {
  constructor(plottingConfirmed, plottingDeaths, plottingRecoveries, plottingActive, plottingIncidence, plottingMortality, plottingRecoveryRate, plottingVaccine) {
    this.timeSeries = jhuData;
    this.emptyIcon = new L.DivIcon({className: 'emptyMarker'});
    const that = this;
    this.markers = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      maxClusterRadius: function () {
        return document.getElementById('cluster_radius').value;
      },
      iconCreateFunction: function (cluster) {
        const bounds = map.getBounds();
        if (!bounds.contains(cluster._latlng)) return new L.DivIcon({className: 'emptyCluster'});
        const clusterChildren = cluster.getAllChildMarkers();
        const size = cluster.getChildCount();
        let confirmed = 0;
        let deaths = 0;
        let recoveries = 0;
        let vaccines = 0;
        let population = 0;
        let i = -1;
        while (++i < size) {
          const child = clusterChildren[i];
          confirmed += child.confirmed;
          deaths += child.deaths;
          recoveries += child.recoveries;
          vaccines += child.vaccines;
          population += child.population;
        }
        const active = that.computeActive(confirmed, deaths, recoveries);
        return that.layerIcon(confirmed, deaths, recoveries, vaccines, active, population);
      }
    });

    // The following four methods are hard to trigger
    this.markers.on('click', function(e) {
      updateFocusLocation(getClosestMarker(e.latlng));
    });
    this.markers.on('clusterclick', function(e) {
      updateFocusLocation(getClosestMarker(e.latlng));
    });
    this.markers.on('dblclick',function (e) {
      map.setView(e.latlng, map.getZoom() + 1);
      updateFocusLocation(getClosestMarker(e.latlng));
    });
    this.markers.on('clusterdblclick',function (e) {
      map.setView(e.latlng, map.getZoom() + 1);
      updateFocusLocation(getClosestMarker(e.latlng));
    });

    this.timeSeriesMarkers_3 = this.timeSeries.map(function (p) {
      const marker = L.marker([p.lat, p.lng]);
      marker.name = p.name;
      marker.population = parseInt(p.pop);
      if (isNaN(marker.population))
        marker.population = 0;
      marker.time_series = p.time_series;
      marker.setIcon(that.emptyIcon);
      if (p.l != "3") return marker;
    }).filter(function(p) {return p != undefined});

    this.timeSeriesMarkers_2 = this.timeSeries.map(function (p) {
      const marker = L.marker([p.lat, p.lng]);
      marker.name = p.name;
      marker.population = parseInt(p.pop);
      if (isNaN(marker.population))
        marker.population = 0;
      marker.time_series = p.time_series;
      marker.setIcon(that.emptyIcon);
      if ((p.l == "1" && p.l_3 == "") || (p.l == "2" && p.l_2 != ""))
        return marker;
    }).filter(function(p) {return p != undefined});

    this.timeSeriesMarkers_1 = this.timeSeries.map(function (p) {
      const marker = L.marker([p.lat, p.lng]);
      marker.name = p.name;
      marker.population = parseInt(p.pop);
      if (isNaN(marker.population))
        marker.population = 0;
      marker.time_series = p.time_series;
      marker.setIcon(that.emptyIcon);
      if (p.l_2 == "")
        return marker;
      else
        return undefined;
    }).filter(function(p) {return p != undefined});

    this.timeSeriesMarkers = this.timeSeriesMarkers_3;

    this.markers.clearLayers();
    this.markers.addLayers(this.timeSeriesMarkers)

    this.subLayers = {
      confirmed: {plotting: plottingConfirmed},
      deaths: {plotting: plottingDeaths},
      recoveries: {plotting: plottingRecoveries},
      active: {plotting: plottingActive},
      incidence: {plotting: plottingIncidence},
      mortality: {plotting: plottingMortality},
      recoveryrate: {plotting: plottingRecoveryRate},
      vaccine: {plotting: plottingVaccine}
    };
    if (this.plottingAny()) {
      map.addLayer(this.markers);
      this.plotData(displayStartDate, displayEndDate);
    }
  }


  plottingAny() {
    return Object.values(this.subLayers).reduce(
        function (a, b) {
          return a || b.plotting;
        },
        false);
  }

  setPlotting(subLayer, enabled) {
    if (!this.plottingAny()) {
      map.addLayer(this.markers);
    }
		if (enabled == undefined) {
	    this.subLayers[subLayer].plotting = !this.subLayers[subLayer].plotting;
		} else {
	    this.subLayers[subLayer].plotting = enabled;
		}
    if (this.plottingAny()) {
      this.plotData(displayStartDate, displayEndDate);
    } else {
      map.removeLayer(this.markers);
    }
  }

  plotData(timeStart, timeEnd) {
    if (this.plottingAny()) {
      if (this.timeSeriesMarkers.length == 0) return ;
      const timeSeries = this.timeSeriesMarkers[0].time_series.map((e) => e[0]);
      let iStart = nodeIndexOfTime(timeSeries, timeStart);
      const iEnd = nodeIndexOfTime(timeSeries, timeEnd);
      const bounds = map.getBounds();
      for (let i = 0; i < this.timeSeriesMarkers.length; i++) {
        const m = this.timeSeriesMarkers[i];
        if (m.time_series.length < iEnd) continue;
        if (iStart === iEnd && iStart > 0) {
          iStart = iStart - 1;
        }
        const entryStart = m.time_series[iStart];
        const entryEnd = m.time_series[iEnd];
        const confirmed = entryEnd[1] - entryStart[1];
        const deaths = entryEnd[2] - entryStart[2];
        const recoveries = entryEnd[3] - entryStart[3];
        const vaccines = entryEnd[4] - entryStart[4];
        const active = this.computeActive(confirmed, deaths, recoveries);
        const population = m.population;
        if (bounds.contains(m._latlng)) {
          const icon = this.layerIcon(confirmed, deaths, recoveries, vaccines, active, population);
          m.setIcon(icon)
        } else {
          m.setIcon(this.emptyIcon);
        }
        m.confirmed = confirmed;
        m.deaths = deaths;
        m.recoveries = recoveries;
        m.vaccines = vaccines;
        m.active = active;
      }
      this.markers.refreshClusters();
    }
  }

  isTimeWindowEmpty() {
    for(let i = this.timeSeriesMarkers.length; i--; ) {
      const m = this.timeSeriesMarkers[i];
      if (m.confirmed > 0 || m.deaths > 0 || m.recoveries > 0) {
        return false;
      }
    }
    return true;
  }

  computeActive(confirmed, deaths, recoveries) {
    return confirmed - (deaths + recoveries);
  }

  layerIcon(confirmed, deaths, recovered, vaccines, active, population) {
    const prefix = 'position: absolute;' +
    'border-radius: 50%;' +
    'top: 50%;' +
    'left: 50%;';
    let output = '';
      const confirmedSize = markerSize(confirmed, CIRCLE_TYPES.confirmed);
      let confirmedStyle =
          'position: relative;' +
          'font-weight: bolder;' +
          'border-radius: 50%;' +
          'line-height: ' + confirmedSize + 'px;' +
          'width: ' + confirmedSize + 'px;' +
          'height: ' + confirmedSize + 'px;';

      if (this.subLayers.confirmed.plotting) {
        confirmedStyle += 'border: dotted black ;';
      }
      if (this.subLayers.recoveries.plotting && recovered > 0) {
        const recoveredSize = markerSize(recovered, CIRCLE_TYPES.recoveries);
        const recoveredStyle = prefix +
            'margin: ' + (-recoveredSize / 2) + 'px 0px 0px ' + (-recoveredSize / 2) + 'px;' +
            'width: ' + recoveredSize + 'px;' +
            'height: ' + recoveredSize + 'px;' +
            'border: dotted green ;';
            output += `<div class="circle" style="${recoveredStyle}"></div>`;
      }
      if (this.subLayers.incidence.plotting && confirmed > 0) {
        const incidenceSize = markerSize2(confirmed, population, CIRCLE_TYPES.incidence);
        const incidenceStyle = prefix +
          'margin: ' + (-incidenceSize / 2) + 'px 0px 0px ' + (-incidenceSize / 2) + 'px;' +
          'width: ' + incidenceSize + 'px;' +
          'height: ' + incidenceSize + 'px;' +
          'border: solid black ;';
          output += `<div class="circle" style="${incidenceStyle}"></div>`;
      }
      if (this.subLayers.mortality.plotting && deaths > 0) {
        const mortalitySize = markerSize2(deaths, confirmed, CIRCLE_TYPES.mortality);
        const mortalityStyle = prefix +
            'margin: ' + (-mortalitySize / 2) + 'px 0px 0px ' + (-mortalitySize / 2) + 'px;' +
            'width: ' + mortalitySize + 'px;' +
            'height: ' + mortalitySize + 'px;' +
            'border: solid red ;';
        output += `<div class="circle" style="${mortalityStyle}"></div>`;
      }
      if (this.subLayers.deaths.plotting && deaths > 0) {
        const deathsSize = markerSize(deaths, CIRCLE_TYPES.deaths);
        const deathsStyle = prefix +
            'margin: ' + (-deathsSize / 2) + 'px 0px 0px ' + (-deathsSize / 2) + 'px;' +
            'width: ' + deathsSize + 'px;' +
            'height: ' + deathsSize + 'px;' +
            'border: dotted red ;';
            output += `<div class="circle" style="${deathsStyle}"></div>`;
      }
      if (this.subLayers.recoveryrate.plotting && recovered > 0) {
        const recoveryRateSize = markerSize2(recovered, recovered + deaths, CIRCLE_TYPES.recoveryrate);
        const recoveryRateStyle = prefix +
            'margin: ' + (-recoveryRateSize / 2) + 'px 0px 0px ' + (-recoveryRateSize / 2) + 'px;' +
            'width: ' + recoveryRateSize + 'px;' +
            'height: ' + recoveryRateSize + 'px;' +
            'border: solid green ;';
        output += `<div class="circle" style="${recoveryRateStyle}"></div>`;
      }
      if (this.subLayers.vaccine.plotting && vaccines > 0) {
        const vaccineSize = markerSize(vaccines, CIRCLE_TYPES.vaccine);
        const vaccineStyle = prefix +
            'margin: ' + (-vaccineSize / 2) + 'px 0px 0px ' + (-vaccineSize / 2) + 'px;' +
            'width: ' + vaccineSize + 'px;' +
            'height: ' + vaccineSize + 'px;' +
            'border: solid blue ;';
        output += `<div class="circle" style="${vaccineStyle}"></div>`;
      }
      if (this.subLayers.active.plotting && active > 0) {
        const activeSize = markerSize(active, CIRCLE_TYPES.active);
        const activeStyle = prefix +
            'margin: ' + (-activeSize / 2) + 'px 0px 0px ' + (-activeSize / 2) + 'px;' +
            'width: ' + activeSize + 'px;' +
            'height: ' + activeSize + 'px;' +
            'border: dotted orange ;';
            output += `<div class="circle" style="${activeStyle}"></div>`;
      }
      if ((confirmed + deaths + recovered) === 0) {
        confirmedStyle += 'display: none;';
      }

      return new L.DivIcon({
        html: `<div class="circle" style="${confirmedStyle}">${output}</div>`,
        className: 'marker-cluster',
        iconSize: new L.Point(confirmedSize, confirmedSize)
      });
    }
}

const confirmedCasesSelected = document.getElementById("confirmed_checkbox").checked;
const deathsSelected = document.getElementById("deaths_checkbox").checked;
const recoveredSelected = document.getElementById("recoveries_checkbox").checked;
const activeSelected = document.getElementById("active_checkbox").checked;
const vaccineSelected = document.getElementById("vaccine_checkbox").checked;
const incidenceSelected = document.getElementById("incidence_checkbox").checked;
const mortalitySelected = document.getElementById("mortality_checkbox").checked;
const recoveryRateSelected = document.getElementById("recoveryrate_checkbox").checked;

const jhuLayer = new JHUDataLayer(confirmedCasesSelected, deathsSelected, recoveredSelected, activeSelected, incidenceSelected, mortalitySelected, recoveryRateSelected, vaccineSelected);

document.getElementById("end_date").valueAsDate = new Date('January 12, 2022');
dataEndDate = document.getElementById("end_date").valueAsDate;
dataStartDate = document.getElementById("start_date").valueAsDate;

document.getElementById('animation_start').valueAsDate = dataStartDate;
document.getElementById('animation_end').valueAsDate = dataEndDate;

const min = dateToEpochMins(dataStartDate);
const max = dateToEpochMins(dataEndDate);

slider_range.slider("option", "min", min);
slider_range.slider("option", "max", max);

if (animate_window_max) {
  animateWindow = max - min;
}

setDisplayedDateRange(min, min + animateWindow);
selectMarkerByName('Brazil');

//TODO: make this a binary search since that's definitely more efficient. To bad
// I'm too lazy to do it right the first time. Well, it seems to work as is,
// so why do more work than I have to? Make this change if it's too slow.
function nodeIndexOfTime(timeList, time) {
  if (time == undefined) return timeList.length - 1;
  let m = 0;
  let n = timeList.length - 1;
  var gg = 0;
  while (m <= n) {
     var k = (n + m) >> 1;
     if (timeList[k] < time) {
         m = k + 1;
     } else if (timeList[k] >= time) {
       if (timeList[k - 1] >= time) {
           n = k - 1;
       } else {
         return k;
       }
     } else if (m == n) return k;
  }
  return timeList.length - 1;
}

// 99% sure this isn't the correct way to do this, but I can't be bothered to
// learn proper threading in JS. Not sure it even exists. This looks like it
// works though.

async function animateMarkers() {
  if (!animating) {
    document.getElementById("animate").style.display = "";
    document.getElementById("paused").style.display = "none";
    document.getElementById("animate").innerHTML = 'Pause';
    animating = true;
    if (!animation_paused) {
      setDisplayedDateRange(dateToEpochMins(dataStartDate), dateToEpochMins(dataStartDate) + animateWindow);
    }
    while (animating && stepForward()) {
      await new Promise(r => setTimeout(r, animateSpeed));
    }
    if (animating) {
      await terminateAnimation();
    }
  } else {
    pauseAnimation();
  }
}

function pauseAnimation() {
  animating = false;
  animation_paused = true;
  document.getElementById("animate").style.display = "none";
  document.getElementById("paused").style.display = "";
}

// Since I'm doing a bit of a hack here, the least I can do is hide it in function.
async function terminateAnimation() {
  animating = false;
  animation_paused = false;
  document.getElementById("animate").style.display = "";
  document.getElementById("paused").style.display = "none";
  document.getElementById("animate").innerHTML = 'Start &raquo;';
  if (dataEndDate) {
    if (!totalAnimation) {
      setDisplayedDateRange(dateToEpochMins(dataEndDate) - animateWindow, dateToEpochMins(dataEndDate));
    } else {
      setDisplayedDateRange(dateToEpochMins(dataStartDate), dateToEpochMins(dataEndDate));
    }
    while (jhuLayer.isTimeWindowEmpty()) {
      stepBack();
      await new Promise(r => setTimeout(r, animateSpeed));
    }
  }
}

function normalizeCount(clusterSize) {
  if (dailyRate) {
    if (totalAnimation) {
      const window = displayEndDate - displayStartDate;
      return ((clusterSize / window) * (60 * 24)).toFixed(2);
    }
    else {
      return ((clusterSize / animateWindow) * (60 * 24)).toFixed(2);
    }
  } else {
    return clusterSize;
  }
}

function markerSize(clusterSize, circle_type) {
	if (clusterSize <= 0) return 0;
	switch(current_view_type) {
		default:
		case VIEW_TYPES.LINEAR: {
			let max_daily = (circle_type == 0) ? 50000: 10000;
	    const windowSize = (totalAnimation) ? displayEndDate - displayStartDate : animateWindow;
	    const max_range = max_daily * (windowSize / (60 * 24));
	    const max_size = 1000;
	    const size = max_size * (clusterSize / max_range);
	    switch (circle_type) {
	      case CIRCLE_TYPES.confirmed: return 10 + size * confirmed_scale;
	      case CIRCLE_TYPES.deaths: return 10 + size * deaths_scale;
	      case CIRCLE_TYPES.recoveries: return 10 + size * recoveries_scale;
	      case CIRCLE_TYPES.active: return 10 + size * active_scale;
	      case CIRCLE_TYPES.vaccine: return 10 + size * vaccine_scale;
	    }
			return 10;
		}
		case VIEW_TYPES.LOG: {
			const base = 40 + Math.log10(2 * clusterSize) ** 2;
			switch (circle_type) {
				case CIRCLE_TYPES.confirmed: return base * confirmed_scale;
				case CIRCLE_TYPES.deaths: return base * deaths_scale;
				case CIRCLE_TYPES.recoveries: return base * recoveries_scale;
				case CIRCLE_TYPES.active: return base * active_scale;
				case CIRCLE_TYPES.vaccine: return base * vaccine_scale;
				default: return base;
			}
		}
		case VIEW_TYPES.FLANNERY: {
			const base_radius = 1.0;
			const base_value = 50.0;
			const radius = base_radius * Math.pow(clusterSize / base_value, 0.5716);

			switch (circle_type) {
				case CIRCLE_TYPES.confirmed: return radius * confirmed_scale;
				case CIRCLE_TYPES.deaths: return radius * deaths_scale;
				case CIRCLE_TYPES.recoveries: return radius * recoveries_scale;
				case CIRCLE_TYPES.active: return radius * active_scale;
				case CIRCLE_TYPES.vaccine: return radius * vaccine_scale;
				default: return radius;
			}
		}
		case VIEW_TYPES.ABSOLUTE: {
			const base_radius = 1.0;
			const base_value = 10.0;
			const radius = base_radius * Math.pow(clusterSize / base_value, 0.5);
			switch (circle_type) {
				case CIRCLE_TYPES.confirmed: return radius * confirmed_scale;
				case CIRCLE_TYPES.deaths: return radius * deaths_scale;
				case CIRCLE_TYPES.recoveries: return radius * recoveries_scale;
				case CIRCLE_TYPES.active: return radius * active_scale;
				case CIRCLE_TYPES.vaccine: return radius * vaccine_scale;
				default: return radius;
			}
		}
	}
}

function markerSize2(clusterSize, totalSize, circle_type) {
  if (clusterSize <= 0 || totalSize <= 0) return 0;
  else {
		// incidence
		switch(circle_type) {
			case CIRCLE_TYPES.incidence: {
	      let windowSize = 0;
	      if (totalAnimation) {
	          windowSize = dateToEpochMins(dataEndDate) - dateToEpochMins(dataStartDate);
	      } else {
	          windowSize = animateWindow;
	      }
	      if (dataEndDate == undefined) return 0;
	      const ratio = (dateToEpochMins(dataEndDate) - dateToEpochMins(dataStartDate)) / windowSize;
	      const scale = 1;
	      return 10 + clusterSize / (totalSize / 5000) * scale * incidence_scale;
	    }
			case CIRCLE_TYPES.mortality: {
	      var percent = clusterSize / totalSize;
	      if (percent > 0.5) percent = 0.5;
	      const maxSize = 250;
	      return 10 + maxSize * percent * mortality_scale;
			}
			case CIRCLE_TYPES.recoveryrate: {
	      var percent = clusterSize / totalSize;
	      const maxSize = 50;
	      return 10 + maxSize * percent * recoveryrate_scale;
	    }
		}
  }
}

const circle_view_types_allowed = {
	confirmed: [VIEW_TYPES.LINEAR, VIEW_TYPES.LOG, VIEW_TYPES.FLANNERY, VIEW_TYPES.ABSOLUTE],
	deaths: [VIEW_TYPES.LINEAR, VIEW_TYPES.LOG, VIEW_TYPES.FLANNERY, VIEW_TYPES.ABSOLUTE],
	recoveries: [VIEW_TYPES.LINEAR, VIEW_TYPES.LOG, VIEW_TYPES.FLANNERY, VIEW_TYPES.ABSOLUTE],
	active: [VIEW_TYPES.LINEAR, VIEW_TYPES.LOG, VIEW_TYPES.FLANNERY, VIEW_TYPES.ABSOLUTE],
	vaccine: [VIEW_TYPES.LINEAR, VIEW_TYPES.LOG, VIEW_TYPES.FLANNERY, VIEW_TYPES.ABSOLUTE],
	incidence: [VIEW_TYPES.DEFAULT, VIEW_TYPES.RATE],
	mortality: [VIEW_TYPES.DEFAULT, VIEW_TYPES.RATE],
	recoveryrate: [VIEW_TYPES.RATE],
};

function setScale(view_type) {
	current_view_type = (view_type in VIEW_TYPES) ? VIEW_TYPES[view_type] : VIEW_TYPES.DEFAULT;
	for (const [key, enabled_view_types] of Object.entries(circle_view_types_allowed)) {
		const enabled = enabled_view_types.includes(current_view_type);
		setPlotting(key, enabled);
	}
  setDisplayedDateRange(displayStartDate, displayEndDate);
}

function setPlotting(subLayer, enabled) {
	const checkboxId = `${subLayer}_checkbox`;
  document.getElementById(checkboxId).checked = enabled;
  jhuLayer.setPlotting(subLayer, enabled);
}

function dateToEpochMins(date) {
  return date.getTime() / (1000 * 60);
}

function epochMinsToDate(mins) {
  return new Date(mins * 60 * 1000);
}

function updateProgressBar(processed, total, elapsed, layersArray) {
  const progress = document.getElementById('progress');
  const progressBar = document.getElementById('progress-bar');

  if (elapsed > 500) {
    // if it takes more than half a second to load, display the progress bar:
    progress.style.display = 'block';
    progressBar.style.width = Math.round(processed / total * 100) + '%';
  }

  if (processed === total) {
    // all markers processed - hide the progress bar:
    progress.style.display = 'none';
  }
}

function setAnimateWindowFromInput(size) {
  setAnimateWindow(24*60*parseInt(size));
}

function setAnimateWindow(size) {
  animateWindow = size;
  const startDate = displayStartDate;
  const endDate = startDate + animateWindow;
  setDisplayedDateRange(startDate, endDate);
}

function toggleAnimateMax() {
  animate_window_max = !animate_window_max;
  if (animate_window_max) {
    document.getElementById('animate_window').disabled = true;
    tempAnimateWindow = animateWindow;
    const startDate = dateToEpochMins(dataStartDate);
    const endDate = dateToEpochMins(dataEndDate);
    animateWindow = endDate - startDate;
    setDisplayedDateRange(startDate, endDate);
    //displayStartDate = dataStartDate;
    //setAnimateWindow(dateToEpochMins(dataEndDate) - dateToEpochMins(dataStartDate));
  } else {
    if (! totalAnimation)
      document.getElementById('animate_window').disabled = false;
    setAnimateWindow(24 * 60 * parseInt(document.getElementById('animate_window').value));
  }
}

function formatDate(date) {
  var d = new Date(date),
      month = '' + (d.getMonth() + 1),
      day = '' + d.getDate(),
      year = d.getFullYear();

  if (month.length < 2)
      month = '0' + month;
  if (day.length < 2)
      day = '0' + day;

  return [year, month, day].join('-');
}

function setDisplayedDateRange(startMins, endMins) {

  //var t0 = performance.now();
  const minMins = dataStartDate.getTime() / 60 / 1000;
  const maxMins = dataEndDate.getTime() / 60 / 1000;
  const min = Number(((startMins - minMins) * 100) / (maxMins - minMins));
  const max = Number(((endMins - minMins) * 100) / (maxMins - minMins));
  const normalMin = min / 100 * 90 + 5;
  const normalMax = max / 100 * 90 + 5;
  document.getElementById('start').style.left = normalMin + "%";
  document.getElementById('end').style.left = normalMax + "%";

  displayEndDate = endMins;
  displayStartDate = startMins;
  // Set UI controls to reflect these values
  document.getElementById("display_start_date").valueAsDate = epochMinsToDate(startMins);
  document.getElementById("display_end_date").valueAsDate = epochMinsToDate(endMins);
  document.getElementById("start").innerHTML = formatDate(epochMinsToDate(startMins + 12 * 60));
  document.getElementById("end").innerHTML = formatDate(epochMinsToDate(endMins + 12 * 60));
  slider_range.slider("values", [startMins, endMins]);

  // Update all layers for new range
  jhuLayer.plotData(startMins, endMins);
  infobox.updateInfoboxByMarker(infobox_marker);
  updateSidebar();
}

function setAnimateStep(step) {
  animateStep = parseInt(step);
}

function setAnimateSpeed(speed) {
  animateSpeed = parseInt(speed);
}

function setAnimationType(type) {
  dailyRate = type;
  infobox.updateInfoboxByMarker(focused_marker);
  updateFocusLocation(focused_marker);
}

function stepForward() {
  let current_end = displayEndDate;
  current_end += animateStep;
  let current_start = displayStartDate;
  if(!totalAnimation){
    current_start += animateStep;
  }
  if (current_end <= dateToEpochMins(dataEndDate)) {
    setDisplayedDateRange(current_start, current_end);
    return true;
  } else {
    return false;
  }
}

function stepBack() {
  let current_end = displayEndDate;
  current_end -= animateStep;
  let current_start = displayStartDate;
  current_start -= animateStep;
  if(!totalAnimation) {
    if (current_start >= dateToEpochMins(dataStartDate) && current_end <= dateToEpochMins(dataEndDate))
      setDisplayedDateRange(current_start, current_end);
  } else {
    if (current_end >= dateToEpochMins(dataStartDate))
      setDisplayedDateRange(displayStartDate, current_end);
  }
}

function setCountryView(country_code) {
  let state_list;
  if (! document.getElementById('only_countries').checked)
    state_list = createStateOptions(bounding_boxes[country_code][0]);
  else {
    while (state_select.lastElementChild) {
      state_select.removeChild(state_select.lastElementChild);
    }
    state_list = [];
  }
  while (county_select.lastElementChild) {
    county_select.removeChild(county_select.lastElementChild);
  }
  const option = document.createElement("option");
  const textnode = document.createTextNode("All");
  option.appendChild(textnode);
  county_select.appendChild(option);
  county_select.disabled = true;
  const bb = bounding_boxes[country_code][1];
  map.fitBounds([[bb[1], bb[0]], [bb[3], bb[2]]]);
  const name = sorted_options.find(e => e[0] == country_code)[1][0];
  if (state_list.length == 0) {
      selectMarkerByName(name);
  }
  else {
    county_list = state_dict[state_list[0]];
    if (county_list.length == 0) {
      selectMarkerByName(state_list[0]);
    }
    else {
      selectMarkerByName(county_list[0] + ", " + state_list[0]);
    }
  }
}

function selectCountry(country_code) {
  state_list = country_dict[bounding_boxes[country_code][0]];
  if (state_list == undefined) return;
  while (state_select_2.lastElementChild) {
    state_select_2.removeChild(state_select_2.lastElementChild);
  }
  if (state_list.length == 0) {
    const option = document.createElement("option");
    const textnode = document.createTextNode("All");
    option.appendChild(textnode);
    option.value = "All";
    state_select_2.appendChild(option);
    state_select_2.disabled = true;
    while (county_select_2.lastElementChild) {
      county_select_2.removeChild(county_select_2.lastElementChild);
    }
    const option_2 = document.createElement("option");
    const textnode_2 = document.createTextNode("All");
    option_2.appendChild(textnode_2);
    option_2.value = "All";
    county_select_2.appendChild(option_2);
    county_select_2.disabled = true;
  }
  else {
    const option = document.createElement("option");
    const textnode = document.createTextNode("All");
    option.appendChild(textnode);
    option.value = "All";
    state_select_2.appendChild(option);
    for (e of state_list) {
      const option = document.createElement("option");
      const textnode = document.createTextNode(e);
      option.appendChild(textnode);
      option.value = e;
      state_select_2.appendChild(option);
    }
    state_select_2.disabled = false;
    county_list = state_dict[state_select_2.value];
    while (county_select_2.lastElementChild) {
      county_select_2.removeChild(county_select_2.lastElementChild);
    }
    if (county_list == undefined || county_list.length == 0) {
      const option = document.createElement("option");
      const textnode = document.createTextNode("All");
      option.appendChild(textnode);
      option.value = "All";
      county_select_2.appendChild(option);
      county_select_2.disabled = true;
    }
    else {
      const option_2 = document.createElement("option");
      const textnode_2 = document.createTextNode("All");
      option_2.appendChild(textnode_2);
      option_2.value = "All";
      county_select_2.appendChild(option_2);
      for (e of county_list) {
        const option = document.createElement("option");
        const textnode = document.createTextNode(e);
        option.appendChild(textnode);
        option.value = e;
        county_select_2.appendChild(option);
      }
      county_select_2.disabled = false;
    }
  }
  updateSidebar();
}

function selectState(state) {
  if (state == "All") {
    while (county_select_2.lastElementChild) {
      county_select_2.removeChild(county_select_2.lastElementChild);
    }
    const option = document.createElement("option");
    const textnode = document.createTextNode("All");
    option.appendChild(textnode);
    option.value = "All";
    county_select_2.appendChild(option);
    county_select_2.disabled = true;
  }
  else {
    county_list = state_dict[state];
    while (county_select_2.lastElementChild) {
      county_select_2.removeChild(county_select_2.lastElementChild);
    }
    if (county_list.length == 0) {
      const option = document.createElement("option");
      const textnode = document.createTextNode("All");
      option.appendChild(textnode);
      option.value = "All";
      county_select_2.appendChild(option);
      county_select_2.disabled = true;
    }
    else {
      const option = document.createElement("option");
      const textnode = document.createTextNode("All");
      option.appendChild(textnode);
      option.value = "All";
      county_select_2.appendChild(option);
      for (e of county_list) {
        const option = document.createElement("option");
        const textnode = document.createTextNode(e);
        option.appendChild(textnode);
        option.value = e;
        county_select_2.appendChild(option);
      }
      county_select_2.disabled = false;
    }
  }
  updateSidebar();
}

function selectCounty(county) {
  updateSidebar();
}

function getBaselineStatistic() {
  const country = bounding_boxes[country_select_2.value][0];
  const state = state_select_2.value;
  const county = county_select_2.value;
  let m = undefined;
  let placenames = "";
  if (state == "All") {
    for (e of jhuData) {
      if (e.l_1 == country && e.l_2 == "" && e.l_3 == "") {
        m = e;
        break;
      }
    }
    placenames = country;
  }
  else {
    if (county == "All") {
      for (e of jhuData) {
        if (e.l_1 == country && e.l_2 == state && e.l_3 == "") {
          m = e;
          break;
        }
      }
      placenames = state;
    }
    else {
      for (e of jhuData) {
        if (e.l_1 == country && e.l_2 == state && e.l_3 == county) {
          m = e;
          break;
        }
      }
      placenames = county;
    }
  }
  if ( m == undefined) return [0, 0, 0, 0, 0, 0];

  let iStart = nodeIndexOfTime(m.time_series.map((e) => e[0]), displayStartDate);
  const iEnd = nodeIndexOfTime(m.time_series.map((e) => e[0]), displayEndDate);
  if (iStart === iEnd && iStart > 0) {
    iStart = iStart - 1;
  }
  const entryStart = m.time_series[iStart];
  const entryEnd = m.time_series[iEnd];
  const confirmed = entryEnd[1] - entryStart[1];
  const deaths = entryEnd[2] - entryStart[2];
  const recoveries = entryEnd[3] - entryStart[3];
  const vaccines = entryEnd[4] - entryStart[4];
  const active = confirmed - deaths - recoveries;
  const population = m.pop;
  return [confirmed, deaths, recoveries, vaccines, active, placenames, population];
}

function createStateOptions(country) {
  state_list = country_dict[country];
  while (state_select.lastElementChild) {
    state_select.removeChild(state_select.lastElementChild);
  }
  if (state_list.length == 0) {
    const option = document.createElement("option");
    const textnode = document.createTextNode("All");
    option.appendChild(textnode);
    state_select.appendChild(option);
    state_select.disabled = true;
  }
  else {
    const option = document.createElement("option");
    const textnode = document.createTextNode("All");
    option.appendChild(textnode);
    state_select.appendChild(option);
    for (e of state_list) {
      const option = document.createElement("option");
      const textnode = document.createTextNode(e);
      option.appendChild(textnode);
      option.value = e;
      state_select.appendChild(option);
    }
    state_select.disabled = false;
  }
  return state_list;
}

function setStateView(state) {
  if (state == "All") {
    setCountryView(document.getElementById('country_select').value);
    return ;
  }
  if (document.getElementById('county_select_div').hidden == true) {
    map.fitBounds(state_bb_dict[state]);
    selectMarkerByName(state);
    while (county_select.lastElementChild) {
      county_select.removeChild(county_select.lastElementChild);
    }
  }
  else {
    const county_list = createCountyOptions(state);
    map.fitBounds(state_bb_dict[state]);
    if (county_list.length == 0) {
      selectMarkerByName(state);
    }
    else {
      selectMarkerByName(county_list[0] + ", " + state);
    }
  }
}

function createCountyOptions(state) {
  let county_list = {};
  if (state in state_dict) {
    county_list = state_dict[state];
    while (county_select.lastElementChild) {
      county_select.removeChild(county_select.lastElementChild);
    }
    if (county_list.length == 0) {
      const option = document.createElement("option");
      const textnode = document.createTextNode("All");
      option.appendChild(textnode);
      county_select.appendChild(option);
      county_select.disabled = true;
    }
    else {
      const option = document.createElement("option");
      const textnode = document.createTextNode("All");
      option.appendChild(textnode);
      county_select.appendChild(option);
      for (e of county_list) {
        const option = document.createElement("option");
        const textnode = document.createTextNode(e);
        option.appendChild(textnode);
        option.value = e;
        county_select.appendChild(option);
      }
      county_select.disabled = false;
    }
  }
  return county_list;
}

function setCountyView(county) {
  if (county == "All") {
    setStateView(document.getElementById('state_select').value);
    return ;
  }
  map.fitBounds(county_bb_dict[county]);
  const state = document.getElementById("state_select").value;
  const name = county + ", " + state;
  selectMarkerByName(name);
}

function setMarylandView() {
  const maryland_bb = [[39.762, -79.514], [37.888, -75.015]];
  map.fitBounds(maryland_bb);
}

function setVirginiaView() {
  const virginia_bb = [[39.462, -83.672], [36.571, -75.015]];
  map.fitBounds(virginia_bb);
}

function locationLevel(level) {
  if (level == 1) {
    document.getElementById('only_countries').checked = true;
    document.getElementById('only_states').checked = false;
    document.getElementById('only_counties').checked = false;
    document.getElementById('state_select_div').hidden = true;
    document.getElementById('county_select_div').hidden = true;
    jhuLayer.timeSeriesMarkers = jhuLayer.timeSeriesMarkers_1;
    jhuLayer.markers.clearLayers();
    jhuLayer.markers.addLayers(jhuLayer.timeSeriesMarkers);
    jhuLayer.plotData(displayStartDate, displayEndDate);
    setCountryView(document.getElementById('country_select').value);
    selectMarkerByName(bounding_boxes[document.getElementById('country_select').value][0]);
  }
  if (level == 2) {
    const flag = (document.getElementById('county_select_div').hidden == false);
    document.getElementById('only_countries').checked = false;
    document.getElementById('only_states').checked = true;
    document.getElementById('only_counties').checked = false;
    document.getElementById('state_select_div').hidden = false;
    document.getElementById('county_select_div').hidden = true;
    jhuLayer.timeSeriesMarkers = jhuLayer.timeSeriesMarkers_2;
    jhuLayer.markers.clearLayers();
    jhuLayer.markers.addLayers(jhuLayer.timeSeriesMarkers);
    jhuLayer.plotData(displayStartDate, displayEndDate);
    if (flag) {
      setStateView(document.getElementById('state_select').value);
    }
    else {
      createStateOptions(bounding_boxes[document.getElementById('country_select').value][0]);
      setCountryView(document.getElementById('country_select').value);
    }
  }
  if (level == 3) {
    const flag = (document.getElementById('state_select_div').hidden == false);
    document.getElementById('only_countries').checked = false;
    document.getElementById('only_states').checked = false;
    document.getElementById('only_counties').checked = true;
    document.getElementById('state_select_div').hidden = false;
    document.getElementById('county_select_div').hidden = false;
    jhuLayer.timeSeriesMarkers = jhuLayer.timeSeriesMarkers_3;
    jhuLayer.markers.clearLayers();
    jhuLayer.markers.addLayers(jhuLayer.timeSeriesMarkers);
    jhuLayer.plotData(displayStartDate, displayEndDate);
    if (flag) {
      setStateView(document.getElementById('state_select').value);
    }
    else {
      createStateOptions(bounding_boxes[document.getElementById('country_select').value][0]);
      createCountyOptions(document.getElementById('state_select').value);
      setCountryView(document.getElementById('country_select').value);
    }
  }
}

// I'm not using a new variable here because I'm a lazy sod

function setAnimationRange(start, end) {
  dataStartDate = start;
  dataEndDate = end;

  const min = dateToEpochMins(dataStartDate);
  const max = dateToEpochMins(dataEndDate);

  slider_range.slider("option", "min", min);
  slider_range.slider("option", "max", max);

  setDisplayedDateRange(min, min + animatewindow);
}

function setTotalAnimation(total) {
  if (total == true) {
    totalAnimation = true;
    document.getElementById('animate_window').disabled = true;
    animateWindow = 0;
    setDisplayedDateRange(dateToEpochMins(dataStartDate), displayEndDate);
    document.getElementById('window_size').hidden = true;
  }
  else {
    totalAnimation = false;
    document.getElementById('animate_window').disabled = false;
    animateWindow = 24 * 60 * parseInt(document.getElementById('animate_window').value);
    if (displayEndDate - animateWindow >= dateToEpochMins(dataStartDate))
      setDisplayedDateRange(displayEndDate - animateWindow, displayEndDate);
    else
      setDisplayedDateRange(dateToEpochMins(dataStartDate), dateToEpochMins(dataStartDate) + animateWindow);
    document.getElementById('window_size').hidden = false;
  }
}
