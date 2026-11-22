/*
 * Copyright 2025-2026 Jean-Yves Avenard
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* Sigenergy Flow Card v77 — standalone Home Assistant Lovelace custom card */

// Scene coordinates: the house photo (1676x557 units) sits between a band above it for the SOLAR and HOME
// readings and a band below it for SigenStor and GRID. tools/embed-artwork.py builds both bands from
// the photo's edge rows, plus [bleed] more beyond the scene that shows when the card is taller than
// the scene; its TOP and BOTTOM must equal top + bleed and bottom + bleed.
// [keep] is the horizontal range (house and readings) that is never cropped as the card narrows.
// Below [narrowBelow] px in portrait, [keepNarrow] (the house and its readings) is protected instead; with the
// custom photo the top readings stay left-aligned and the charger reading sits above the car, inside the range.
const PHOTO = { width: 1676, height: 557, top: 48, bottom: 0, bleed: 100 };
// Where a car_image goes, in ARTWORK's coordinates (tools/make-car.py's CAR_FRAME, 44 units lower).
const CAR_FRAME = { at: [430, 242], size: [200, 192] };
// The cars named by `car`, as <name>-day.avif and <name>-night.avif (listed in cars/cars.json).
const CARS_URL = 'https://raw.githubusercontent.com/jyavenard/sigenergy-flow-card/refs/heads/main/cars/';
// The double garage's overlays (tools/make-garage.py), from GitHub like the cars: the second bay and the lengthened roof
// as double-<day|night>.avif, and the photo's own car, for the second bay, as car-<day|night>.avif.
const GARAGE_URL = 'https://raw.githubusercontent.com/jyavenard/sigenergy-flow-card/refs/heads/main/garage/';
// Where the double garage's overlay goes, in ARTWORK's coordinates, and the transform (an SVG matrix, in the same
// coordinates) that moves a car from the existing bay into the new one.
const DOUBLE_GARAGE = { at: [245, 68], size: [319, 402], car: [0.80792, -0.01126, 0, 0.89884, -67.32, 19.243] };
// The weather conditions with photos of their own (tools/make-weather.py), from GitHub: by day <condition>, at night
// <condition>-night, each as <scene>.avif, the empty garage's patch <scene>-garage.avif (at WEATHER_GARAGE, in
// ARTWORK's coordinates), the double garage's overlay <scene>-double.avif and the photo's car, for its new bay,
// <scene>-car.avif.
const WEATHER_URL = 'https://raw.githubusercontent.com/jyavenard/sigenergy-flow-card/refs/heads/main/weather/';
const WEATHER_SCENES = new Set(['partlycloudy', 'cloudy', 'fog', 'rainy', 'pouring', 'lightning', 'lightning-rainy', 'hail', 'snowy', 'snowy-rainy', 'windy', 'windy-variant']);
const WEATHER_GARAGE = { at: [425, 239], size: [201, 190] };
// The two cars and their options: the AC charger's (the garage's, in the double garage's new bay) and the DC charger's
// (in the double garage's existing bay).
const CARS = [
    { art: 'carArt', car: 'car', image: 'car_image', night: 'car_image_night', shown: 'car_shown', charging: 'car_charging' },
    { art: 'carArt2', car: 'car_2', image: 'car_image_2', night: 'car_image_night_2', shown: 'car_shown_2', charging: 'car_charging_2' },
];
// Where the top and bottom fades (which keep the readings legible) end and start.
const FADE = { topEnd: 140, bottomStart: 533 };
const SCENE = { width: PHOTO.width, height: PHOTO.top + PHOTO.height + PHOTO.bottom, keep: [640, 1240], keepNarrow: [580, 1240], narrowBelow: 560, scale: 1 };
// The user's own house photo replaces the stock artwork. The stock car, garage, charger and weather overlays were
// drawn for the old house, so they are hidden; the AC charger's reading is kept and placed over the photo instead.
const CUSTOM_SCENE = true;
const CHARGER_Y = 312;   // scene y where the charger readings sit, clear above the car

// The Grid dialog's phases, and each phase's keys: the inverter's voltage and current, from [inverter] of the entity
// IDs, and the grid sensor's active power, from [plant].
const GRID_PHASES = ['a', 'b', 'c'];
const gridPhaseEntities = (inverter, plant) => Object.fromEntries(GRID_PHASES.flatMap(phase => [
    ...['voltage', 'current'].map(kind => [`grid_phase_${phase}_${kind}`, [`${inverter(phase)}_${kind}`]]),
    [`grid_phase_${phase}_active_power`, [`${plant(phase)}_active_power`]]]));
// The Grid dialog's columns: power is voltage × current, the apparent power; grid is the grid sensor's active power,
// positive while importing.
const GRID_KINDS = ['voltage', 'current', 'power', 'active_power'];
const GRID_UNITS = { voltage: 'V', current: 'A', power: 'kVA', active_power: 'kW', power_factor: '' };
const GRID_HEADS = { voltage: ['Inverter', 'voltage'], current: ['Inverter', 'current'], power: ['Inverter', 'power'], active_power: ['Grid', 'power'] };

// Default entities for each `entities:` key in the card config, in priority order.
// Plant sensors are the primary source (they combine every inverter and battery);
// inverter sensors are the secondary / fallback source, used only when the plant sensor is unavailable.
// A key set in the config replaces its defaults entirely; `false` hides that item.
const DEFAULT_ENTITIES = {
    pv_power: ['sensor.sigen_plant_pv_power'],
    home_power: ['sensor.sigen_plant_consumed_power'],
    battery_power: ['sensor.sigen_plant_battery_power', 'sensor.sigen_inverter_battery_power'],
    battery_soc: ['sensor.sigen_plant_battery_state_of_charge', 'sensor.sigen_inverter_battery_state_of_charge'],
    battery_capacity: ['sensor.sigen_plant_rated_energy_capacity'],
    // The SOCs the battery stops charging and discharging at, for its remaining time (disabled by default).
    battery_charge_cut_off_soc: ['sensor.sigen_plant_charge_cut_off_soc', 'number.sigen_plant_ess_charge_cut_off_state_of_charge'],
    battery_discharge_cut_off_soc: ['sensor.sigen_plant_discharge_cut_off_soc', 'number.sigen_plant_ess_discharge_cut_off_state_of_charge'],
    // The SOC the battery keeps for a power cut: on grid it stops discharging there (disabled by default).
    battery_backup_soc: ['number.sigen_plant_ess_backup_state_of_charge'],
    // On Grid, Off Grid (Auto) or Off Grid (Manual): off grid, the battery runs down to its discharge cut-off SOC.
    grid_status: ['sensor.sigen_plant_grid_connection_status'],
    grid_import_power: ['sensor.sigen_plant_grid_import_power'],
    grid_export_power: ['sensor.sigen_plant_grid_export_power'],
    phase_mode: ['switch.sigen_plant_independent_phase_power_control'],
    // Grid dialog: the inverter's per-phase readings at its AC terminals and the grid sensor's per-phase power (all
    // disabled by default), and the value shown beside GRID with show_grid_voltage (the phases' average voltage when
    // unset).
    grid_voltage: [],
    ...gridPhaseEntities(phase => `sensor.sigen_inverter_phase_${phase}`, phase => `sensor.sigen_plant_grid_phase_${phase}`),
    grid_power_factor: ['sensor.sigen_inverter_power_factor'],
    ac_charger_power: ['sensor.sigen_ac_charger_charging_power'],
    ac_charger_state: ['sensor.sigen_ac_charger_system_state'],
    ac_charger_total_energy: ['sensor.sigen_ac_charger_total_energy_consumed'],
    ac_charger_vehicle_soc: [],
    ac_charger_vehicle_range: [],
    dc_charger_power: ['sensor.sigen_inverter_dc_charger_output_power'],
    dc_charger_state: ['sensor.sigen_inverter_dc_charger_running_state'],
    dc_charger_vehicle_soc: ['sensor.sigen_inverter_dc_charger_vehicle_soc'],
    dc_charger_limit: ['number.sigen_inverter_dc_charger_max_charging_power_limit'],
    // The car shows in the garage while either charger has power, or while this reads on, charging or more than 0.
    car_charging: [],
    // With the double garage, the second car shows in the new bay while the DC charger has power, or while this reads on,
    // charging or more than 0.
    car_charging_2: [],
    // The plant's EVDC counters cover every inverter but are disabled by default; the first inverter's DC charger
    // totals are enabled.
    dc_charger_lifetime_charged_energy: ['sensor.sigen_plant_total_charged_energy_of_the_evdc', 'sensor.sigen_inverter_dc_charger_total_charging_capacity'],
    dc_charger_lifetime_discharged_energy: ['sensor.sigen_plant_total_discharged_energy_of_the_evdc', 'sensor.sigen_inverter_dc_charger_total_discharging_capacity'],
    // PV Strings dialog: the Sigenergy PV inputs and the third-party PV row, which the Total row adds up. The
    // third-party inverter's energy also counts towards Solar produced and the Energy statistics' solar.
    pv_strings_power: ['sensor.sigen_plant_sigen_pv_power'],
    pv_strings_lifetime_energy: ['sensor.sigen_plant_total_generation_of_self_pv', 'sensor.sigen_plant_total_pv_generation', 'sensor.sigen_inverter_total_pv_energy'],
    third_party_pv_power: ['sensor.sigen_plant_third_party_pv_power'],
    third_party_pv_daily_energy: ['sensor.sigen_plant_daily_third_party_inverter_energy'],
    third_party_pv_lifetime_energy: ['sensor.sigen_plant_total_generation_of_third_party_inverter'],
    daily_pv_energy: ['sensor.sigen_plant_daily_pv_energy', 'sensor.sigen_inverter_daily_pv_energy'],
    daily_grid_import_energy: ['sensor.sigen_plant_daily_grid_import_energy'],
    daily_grid_export_energy: ['sensor.sigen_plant_daily_grid_export_energy'],
    daily_battery_charge_energy: ['sensor.sigen_plant_daily_battery_charge_energy', 'sensor.sigen_inverter_daily_charge_energy'],
    // Energy statistics: lifetime counters, whose change per interval feeds the flow estimate.
    stat_pv: ['sensor.sigen_plant_total_pv_generation'],
    stat_battery_charge: ['sensor.sigen_plant_total_charged_energy_of_the_ess'],
    stat_battery_discharge: ['sensor.sigen_plant_total_discharged_energy_of_the_ess'],
    stat_grid_import: ['sensor.sigen_plant_total_imported_energy'],
    stat_grid_export: ['sensor.sigen_plant_total_exported_energy'],
    stat_evac_charge: ['sensor.sigen_plant_total_charged_energy_of_the_evac', 'sensor.sigen_ac_charger_total_energy_consumed'],
    daily_battery_discharge_energy: ['sensor.sigen_plant_daily_battery_discharge_energy', 'sensor.sigen_inverter_daily_discharge_energy'],
    // Today's solar forecast for all PV, in energy: Forecast.Solar's estimated energy production today, or Solcast's
    // forecast today. The one on the forecast the Energy dashboard uses comes first (_forecastToday).
    solar_forecast_today: ['sensor.energy_production_today', 'sensor.solcast_pv_forecast_forecast_today'],
    // The weather shown at the scene's top left: Home Assistant's default (Met.no) forecast entity.
    weather: ['weather.forecast_home', 'weather.home'],
};
// The same keys for sigenergy2mqtt (`sigenergy_backend: sigenergy2mqtt`), with its default entity ID prefix `sigen`
// and plant 0. Inverter and charger entities carry their Modbus device address: the inverter is assumed at 1, the
// AC charger at 1 or 2. The AC charger's power was `rated_charging_power` before February 2026; Home Assistant
// keeps the entity ID it first registered, so installs from before then still have that name. sigenergy2mqtt has
// no daily energy for a third-party inverter.
const SIGENERGY2MQTT_ENTITIES = {
    pv_power: ['sensor.sigen_0_total_pv_power', 'sensor.sigen_0_plant_pv_power'],
    // General Load Power is the home without the EV chargers; Total Load Power (and consumed_power, which copies it by
    // default) includes the DC charger. Without General Load Power, HOME is the balance of the other flows.
    home_power: ['sensor.sigen_0_general_load_power'],
    battery_power: ['sensor.sigen_0_plant_battery_power', 'sensor.sigen_0_inverter_1_charge_discharge_power'],
    battery_soc: ['sensor.sigen_0_plant_battery_soc', 'sensor.sigen_0_inverter_1_battery_soc'],
    battery_capacity: ['sensor.sigen_0_plant_rated_energy_capacity', 'sensor.sigen_0_inverter_1_rated_battery_capacity'],
    battery_charge_cut_off_soc: ['number.sigen_0_plant_ess_charge_cut_off_soc'],
    battery_discharge_cut_off_soc: ['number.sigen_0_plant_ess_discharge_cut_off_soc'],
    battery_backup_soc: ['number.sigen_0_plant_ess_backup_soc'],
    grid_status: ['sensor.sigen_0_plant_grid_status'],
    grid_import_power: ['sensor.sigen_0_grid_sensor_import_power'],
    grid_export_power: ['sensor.sigen_0_grid_sensor_export_power'],
    phase_mode: ['switch.sigen_0_plant_independent_phase_power_control'],
    grid_voltage: [],
    ...gridPhaseEntities(phase => `sensor.sigen_0_inverter_1_phase_${phase}`, phase => `sensor.sigen_0_plant_grid_phase_${phase}`),
    grid_power_factor: ['sensor.sigen_0_inverter_1_power_factor'],
    ac_charger_power: ['sensor.sigen_0_ac_charger_1_charging_power', 'sensor.sigen_0_ac_charger_2_charging_power', 'sensor.sigen_0_ac_charger_1_rated_charging_power', 'sensor.sigen_0_ac_charger_2_rated_charging_power'],
    ac_charger_state: ['sensor.sigen_0_ac_charger_1_running_state', 'sensor.sigen_0_ac_charger_2_running_state'],
    ac_charger_total_energy: ['sensor.sigen_0_ac_charger_1_total_energy_consumed', 'sensor.sigen_0_ac_charger_2_total_energy_consumed'],
    ac_charger_vehicle_soc: [],
    ac_charger_vehicle_range: [],
    dc_charger_power: ['sensor.sigen_0_dc_charger_1_output_power'],
    dc_charger_state: ['sensor.sigen_0_dc_charger_1_running_state'],
    dc_charger_vehicle_soc: ['sensor.sigen_0_dc_charger_1_vehicle_soc'],
    dc_charger_limit: ['number.sigen_0_dc_charger_1_max_charging_power_limit'],
    car_charging: [],
    car_charging_2: [],
    dc_charger_lifetime_charged_energy: ['sensor.sigen_0_evdc_total_charge_energy', 'sensor.sigen_0_si_evdc_total_charge_energy', 'sensor.sigen_0_dc_charger_1_total_charging_capacity'],
    dc_charger_lifetime_discharged_energy: ['sensor.sigen_0_evdc_total_discharge_energy', 'sensor.sigen_0_si_evdc_total_discharge_energy', 'sensor.sigen_0_dc_charger_1_total_discharging_capacity'],
    // plant_pv_power is the Sigenergy PV alone; total_pv_power, total_daily_pv_energy and lifetime_pv_energy add the
    // third-party inverter.
    pv_strings_power: ['sensor.sigen_0_plant_pv_power', 'sensor.sigen_0_inverter_1_pv_power'],
    pv_strings_lifetime_energy: ['sensor.sigen_0_si_total_self_pv_generation', 'sensor.sigen_0_plant_lifetime_pv_energy', 'sensor.sigen_0_inverter_1_lifetime_pv_energy'],
    third_party_pv_power: ['sensor.sigen_0_third_party_pv_power'],
    third_party_pv_daily_energy: [],
    third_party_pv_lifetime_energy: ['sensor.sigen_0_third_party_pv_lifetime_production', 'sensor.sigen_0_si_total_third_party_pv_generation'],
    daily_pv_energy: ['sensor.sigen_0_total_daily_pv_energy', 'sensor.sigen_0_daily_pv_energy', 'sensor.sigen_0_inverter_1_daily_pv_energy'],
    daily_grid_import_energy: ['sensor.sigen_0_grid_sensor_daily_import_energy'],
    daily_grid_export_energy: ['sensor.sigen_0_grid_sensor_daily_export_energy'],
    daily_battery_charge_energy: ['sensor.sigen_0_daily_charge_energy', 'sensor.sigen_0_inverter_1_daily_charge_energy'],
    // The plant's lifetime counters come first; the Statistics Interface (si_) ones restart from 0 when the firmware
    // gains that interface. lifetime_pv_energy, the plant's PV plus the third-party inverter's, is enabled by default;
    // plant_lifetime_pv_energy and the si_ counters are not.
    stat_pv: ['sensor.sigen_0_lifetime_pv_energy', 'sensor.sigen_0_plant_lifetime_pv_energy', 'sensor.sigen_0_si_total_self_pv_generation', 'sensor.sigen_0_inverter_1_lifetime_pv_energy'],
    stat_battery_charge: ['sensor.sigen_0_accumulated_charge_energy', 'sensor.sigen_0_si_total_charged_energy'],
    stat_battery_discharge: ['sensor.sigen_0_accumulated_discharge_energy', 'sensor.sigen_0_si_total_discharged_energy'],
    stat_grid_import: ['sensor.sigen_0_grid_sensor_lifetime_import_energy', 'sensor.sigen_0_si_total_imported_energy'],
    stat_grid_export: ['sensor.sigen_0_grid_sensor_lifetime_export_energy', 'sensor.sigen_0_si_total_exported_energy'],
    stat_evac_charge: ['sensor.sigen_0_si_total_ev_ac_charged_energy', 'sensor.sigen_0_ac_charger_1_total_energy_consumed', 'sensor.sigen_0_ac_charger_2_total_energy_consumed'],
    daily_battery_discharge_energy: ['sensor.sigen_0_daily_discharge_energy', 'sensor.sigen_0_inverter_1_daily_discharge_energy'],
    solar_forecast_today: DEFAULT_ENTITIES.solar_forecast_today,
    weather: DEFAULT_ENTITIES.weather,
};
const PV_KEYS = ['voltage', 'current', 'power', 'daily_energy', 'accumulated_energy'];
// The AC charger states (IEC 61851 B1 to C2) with a vehicle connected, lower-cased: Sigenergy Local Modbus's (2.0 stores
// keys such as ev_ready, 1.x labels such as EV Ready), then sigenergy2mqtt's.
const AC_CONNECTED = new Set(['reserving', 'preparing', 'ev_ready', 'ev ready', 'charging', 'charger and ev not ready', 'charger ready; ev not ready', 'charger not ready; ev ready']);
// The DC charger states with a vehicle connected, as keys: Sigenergy Local Modbus 2.0's (preparing_comm), 1.x's labels
// (Preparing Comm) and sigenergy2mqtt's (Preparing (Establishing communication)) read the same through dcStateKey.
const DC_CONNECTED = new Set(['occupied', 'preparing', 'preparing_comm', 'preparing_insulation', 'charging', 'scheduled', 'ended', 'discharging']);
const dcStateKey = state => state?.toLowerCase().split(' (')[0].trim().replace(/ /g, '_');
// Browser storage of the battery's learnt overhead (see _learnOverhead).
const OVERHEAD_KEY = 'sigenergy-flow-card-battery-overhead';
// The battery's keys, none of which is read with battery_present: false.
const BATTERY_KEYS = new Set(['battery_power', 'battery_soc', 'battery_capacity', 'battery_charge_cut_off_soc', 'battery_discharge_cut_off_soc',
    'battery_backup_soc', 'daily_battery_charge_energy', 'daily_battery_discharge_energy', 'stat_battery_charge', 'stat_battery_discharge']);
// Default entities and PV string entity for each `sigenergy_backend`; [homeBalance] computes HOME when its entity is missing.
const BACKENDS = {
    sigenergy_local_modbus: { entities: DEFAULT_ENTITIES, pvString: (n, key) => `sensor.sigen_inverter_pv${n}_${key}` },
    sigenergy2mqtt: { entities: SIGENERGY2MQTT_ENTITIES, homeBalance: true, pvString: (n, key) => `sensor.sigen_0_inverter_1_pv${n}_${key === 'accumulated_energy' ? 'lifetime_energy' : key}` },
};
// The solar keys (pv_power, daily_pv_energy, stat_pv) are all PV, the third-party inverter's included. These defaults
// leave the third-party inverter out, so its energy is added to them (see _pvSources).
const SIGEN_ONLY_PV = new Set([
    'sensor.sigen_plant_daily_pv_energy', 'sensor.sigen_inverter_daily_pv_energy', 'sensor.sigen_plant_total_pv_generation',
    'sensor.sigen_0_daily_pv_energy', 'sensor.sigen_0_inverter_1_daily_pv_energy', 'sensor.sigen_0_plant_lifetime_pv_energy',
    'sensor.sigen_0_si_total_self_pv_generation', 'sensor.sigen_0_inverter_1_lifetime_pv_energy',
]);
// The energy tiles: [value element id, daily sensor's entities key, label, the third-party inverter's daily key for a
// solar total, the lifetime counter's key, the third-party inverter's lifetime key].
const DAILY_TILES = [
    ['dayPv', 'daily_pv_energy', 'Solar produced', 'third_party_pv_daily_energy', 'stat_pv', 'third_party_pv_lifetime_energy'],
    ['dayImport', 'daily_grid_import_energy', 'Grid imported', null, 'stat_grid_import'],
    ['dayExport', 'daily_grid_export_energy', 'Grid exported', null, 'stat_grid_export'],
    ['dayCharge', 'daily_battery_charge_energy', 'Battery charged', null, 'stat_battery_charge'],
    ['dayDischarge', 'daily_battery_discharge_energy', 'Battery discharged', null, 'stat_battery_discharge'],
];

// Custom-house layout. Scene coordinates: the photo starts at y=56. Each line is an orthogonal run with a rounded
// elbow, anchored to a physical feature on the photo: SOLAR along the panels' lower edge and down the brickwork to
// the inverter, BATTERY from the cabinet into the gateway, HOME out of the gateway across the brick to the door,
// and GRID down from the gateway and fading out at the frame's bottom edge. All lines meet at the gateway (the white
// unit left of the SigenStor cabinet); the inverter-to-home line is a single run (no branch).
const FLOWS = {
    solarFlow: 'M900 201 H950 Q960 201 960 211 V366',
    inverterFlow: 'M1010 392 H975',
    homeFlow: 'M943 392 H905 Q895 392 895 382 V350 Q895 340 885 340 H710',
    gridFlow: 'M965 417 V577 Q965 587 955 587 H730',
};
// A branch continues its parent's animation from the point where it leaves the parent's path.
const BRANCHES = {};
// The end of each line that meets the gateway.
const GATEWAY_ENDS = { inverterFlow: 'end', homeFlow: 'start', gridFlow: 'start' };
// As in Sigenergy's app, the pulses run on one cycle at one speed. The inverter's pulse starts once the home pulse has
// run into HOME, and lines out of the gateway start as it comes out of the gateway, so it appears to run on through
// it. The grid's pulse into the gateway starts with the inverter's, and the solar pulse is halfway into the inverter as
// the inverter's pulse starts, so a pulse runs on from SOLAR too. The speed, in scene units per second, is
// [speed][0] + [speed][1] × √(home kW), so everything runs quicker as the house uses more; [length] is in scene units.
const PULSE = { speed: [110, 65], length: 130 };
// Callouts: below the SOLAR label to the panels, straight down from the HOME label to the home flow,
// up from the grid flow's end beside GRID, straight down from the cabinet beside the SigenStor text, and up from
// the AC charger beside its reading.
const LEADERS = ['M900 23 V201', 'M710 23 V340', 'M730 587 V495', 'M1017 468 V583', 'M1068 364 V264'];
// Reading positions: [x, y, edge], where y is the reading's top or bottom edge. [lower] places the
// SigenStor and GRID readings: the row's left edge, each reading's left edge, and the row's bottom edge.
// [chargers] is the left edge of the charger readings, centred vertically on CHARGER_Y: [wide, narrow].
// With the custom photo they sit above the car, to the right of the charger; 1120/1040 shift them right while
// keeping the text inside the protected range at the narrowest width (wide [640,1240], narrow [580,1240]).
const READINGS = {
    pv: [927, 16, 'top'],
    home: [740, 16, 'top'],
    lower: { left: 714, columns: [714, 1042], bottom: 588, start: 512 },
    chargers: [1175, 1095],
};

// Series colours are CSS variables so the day and night styles can each define their own.
// As in Sigenergy's app, power supplied to the home is positive (solar, battery discharging, grid import, a vehicle
// supplying the DC charger) and power consumed is negative (home, battery charging, grid export, vehicle charging);
// [negate] flips a sensor whose sign is the other way.
const CHART_SERIES = [
    { key: 'pv_power', color: 'var(--c-solar)', name: 'Solar' },
    { key: 'battery_power', color: 'var(--c-battery)', name: 'Battery', negate: true },
    { key: 'grid_import_power', color: 'var(--c-grid)', name: 'Grid' },
    { key: 'grid_export_power', color: 'var(--c-grid)', name: 'Grid', negate: true },
    { key: 'ac_charger_power', color: 'var(--c-ac)', name: 'EVAC', optional: true, negate: true },
    { key: 'dc_charger_power', color: 'var(--c-dc)', name: 'EVDC', optional: true, negate: true },
    { key: 'home_power', color: 'var(--c-home)', name: 'Home', negate: true },
];
const PV_COLORS = [0, 1, 2, 3, 4, 5].map(i => `var(--pv${i})`);
const STYLES = {
    night: {
        'fg': '#edf3f6', 'sub': '#96a5af', 'card': '#11191d', 'card-line': '#343b44', 'panel': '#222831', 'panel-line': '#35414a',
        'tile': '#2a323d', 'tile-hover': '#323b47', 'tile-sub': '#aabac5', 'heading': '#d5e5e8', 'bar': '#45515c', 'bar-fill': 'linear-gradient(90deg,#49b5ac,#9ee4db)',
        'pill': '#343b46', 'pill-fg': '#b8c3ce', 'legend': '#abb9c2', 'muted': '#8f9ea8', 'icon': '#b3c0c9', 'load-bar': '#3a4550', 'load-fill': '#b6d8db',
        'other-line': '#3f4c56', 'other-fill': '#5b6872', 'tip': 'rgba(17,25,29,.94)', 'tip-line': '#3f4c56', 'tip-shadow': '#0008', 'dialog': '#1a2227', 'dialog-line': '#35414a',
        'grid': '#43505a', 'axis': '#a5b3bf', 'cursor': '#9fb0bb', 'dot-edge': '#11191d', 'scene': '#11191d', 'fade': '#11191d', 'fade-opacity': 1, 'fade-left': .7,
        'node-fg': '#edf3f6', 'node-sub': '#d0dade', 'node-em': '#a5ecd9', 'node-shadow': '0 1px 2px #000,0 2px 10px #000c', 'leader': 'rgba(225,234,236,.55)',
        'wire-on': 'rgba(99,214,193,.85)', 'comet': '#8ff5e1',
        'c-solar': '#ead66c', 'c-battery': '#69d4d1', 'c-grid': '#8d8bff', 'c-ac': '#efa66a', 'c-dc': '#c28aff', 'c-home': '#c7d8df',
        'sk-evdc': '#f0b44c', 'sk-evac': '#d9726a', 'sk-load': '#9a6cf0',
        'pv0': '#6bd36b', 'pv1': '#5fd4dc', 'pv2': '#6a78f0', 'pv3': '#a868f0', 'pv4': '#efa66a', 'pv5': '#ead66c', 'pv-third': '#c9ced6',
    },
    day: {
        'fg': '#1f2733', 'sub': '#6c7a89', 'card': 'linear-gradient(180deg,#d6f4f3,#e9f5fa 45%,#f5f9fc)', 'card-line': '#d3e3ec', 'panel': 'rgba(255,255,255,.8)', 'panel-line': '#e0eaf1',
        'tile': '#edf3f8', 'tile-hover': '#e2ecf4', 'tile-sub': '#6c7a89', 'heading': '#2b3744', 'bar': '#d9e5ed', 'bar-fill': 'linear-gradient(90deg,#1fc2bc,#6fe0d6)',
        'pill': '#e6eef4', 'pill-fg': '#5d6c7b', 'legend': '#5d6c7b', 'muted': '#7a8794', 'icon': '#5d6c7b', 'load-bar': '#d5e1ea', 'load-fill': '#3fb6c6',
        'other-line': '#c3d2dd', 'other-fill': '#9fb0bd', 'tip': 'rgba(255,255,255,.96)', 'tip-line': '#d3e0ea', 'tip-shadow': '#3b536a30', 'dialog': '#f7fafc', 'dialog-line': '#d3e0ea',
        'grid': '#d0dce5', 'axis': '#7a8794', 'cursor': '#7a8794', 'dot-edge': '#fff', 'scene': '#e4f2f7', 'fade': '#0e1b26', 'fade-opacity': .7, 'fade-left': .6,
        'node-fg': '#fff', 'node-sub': '#f2f6f8', 'node-em': '#c4f6ea', 'node-shadow': '0 0 2px #000c,0 1px 3px #000,0 2px 10px #000d', 'leader': 'rgba(255,255,255,.7)',
        'wire-on': 'rgba(18,184,166,.9)', 'comet': '#5eead4',
        'c-solar': '#e2a900', 'c-battery': '#14b3ac', 'c-grid': '#6f6df2', 'c-ac': '#ea8a3c', 'c-dc': '#a35ff0', 'c-home': '#6b7f8c',
        'sk-evdc': '#e39a1b', 'sk-evac': '#d4584f', 'sk-load': '#7f4ee0',
        'pv0': '#3fb83f', 'pv1': '#14b5c0', 'pv2': '#5465e8', 'pv3': '#9b52e8', 'pv4': '#ea8a3c', 'pv5': '#e2a900', 'pv-third': '#7d8796',
    },
};
const styleVars = style => Object.entries(STYLES[style]).map(([name, value]) => `--${name}:${value}`).join(';');
const COMET_LAYERS = [1, .78, .56, .36, .18];

// Energy statistics: sources feed consumers. Solar is a total, with the third-party inverter's [third] counter (see
// _pvSources).
const STAT_SOURCES = [
    { name: 'SOLAR', color: 'var(--c-solar)', key: 'stat_pv', third: 'third_party_pv_lifetime_energy', caption: 'Solar' },
    { name: 'BATTERY', color: 'var(--c-battery)', key: 'stat_battery_discharge', caption: 'Battery' },
    { name: 'EVDC', color: 'var(--sk-evdc)', key: 'dc_charger_lifetime_discharged_energy', caption: 'EVDC' },
    { name: 'GRID', color: 'var(--c-grid)', key: 'stat_grid_import', caption: 'Imported' },
];
const STAT_SINKS = [
    { name: 'BATTERY', color: 'var(--c-battery)', key: 'stat_battery_charge', caption: 'Charged' },
    { name: 'EVDC', color: 'var(--sk-evdc)', key: 'dc_charger_lifetime_charged_energy', caption: 'EVDC Charged' },
    { name: 'LOAD', color: 'var(--sk-load)', key: null, caption: 'Load' },
    { name: 'EVAC', color: 'var(--sk-evac)', key: 'stat_evac_charge', caption: 'EVAC Charged' },
    { name: 'GRID', color: 'var(--c-grid)', key: 'stat_grid_export', caption: 'Exported' },
];
// How readily each source (solar, battery, EVDC, grid) feeds each consumer (battery, EVDC, load, EVAC, export); zero
// where a device would feed itself. Fitted so that the split reproduces the flows the Sigenergy app shows.
const STAT_AFFINITY = [
    [0.7921, 1, 0.0609, 0.0208, 0.0303],
    [0, 87.6811, 0.108, 0.0151, 0.0049],
    [0.02, 0, 0.02, 0.02, 0.02],
    [0.0247, 0.0192, 0.1678, 0.0631, 0],
];
const STAT_RANGES = ['Day', 'Week', 'Month', 'Year', 'Lifetime'];
// The standalone cards also have a rolling Last 7 days, today included.
const SOLO_RANGES = ['Day', 'Last 7 days', 'Week', 'Month', 'Year', 'Lifetime'];
const PERIODS = { day: 'Day', last_7_days: 'Last 7 days', week: 'Week', month: 'Month', year: 'Year', lifetime: 'Lifetime' };
// The ranges whose energy metrics have a bar per day.
const DAILY_BARS = new Set(['Week', 'Last 7 days', 'Month']);
// The card's parts; the standalone cards each show one (SOLO_CARDS).
const PARTS = ['scene', 'battery', 'tiles', 'metrics', 'sankey'];
// Energy metrics bars, with the names in Sigenergy's app: [at] is the index in STAT_SOURCES (for [source]) or
// STAT_SINKS, stacked in this order from 0 outwards. Charging and export are darker than discharging and import.
const BAR_SERIES = [
    { name: 'Solar', color: 'var(--c-solar)', source: true, at: 0 },
    { name: 'Discharged', color: 'var(--c-battery)', source: true, at: 1 },
    { name: 'EVDC Discharged', color: 'var(--sk-evdc)', source: true, at: 2 },
    { name: 'Imported', color: 'var(--c-grid)', source: true, at: 3 },
    { name: 'Charged', color: 'color-mix(in srgb, var(--c-battery) 62%, #000)', at: 0 },
    { name: 'EVDC Charged', color: 'color-mix(in srgb, var(--sk-evdc) 62%, #000)', at: 1 },
    { name: 'Exported', color: 'color-mix(in srgb, var(--c-grid) 62%, #000)', at: 4 },
    { name: 'Load', color: 'var(--sk-load)', at: 2 },
    { name: 'EVAC Charged', color: 'var(--sk-evac)', at: 3 },
];

// Weather icons in the style of Sigenergy's app (a sun or moon behind a white cloud), drawn in a 64-unit square.
// Clouds are circles over a rounded bar, filled with one gradient across the icon so the shapes merge.
const WX_CLOUD = '<rect x="10" y="36" width="46" height="16" rx="8"/><circle cx="24" cy="37" r="10"/><circle cx="37" cy="32" r="13"/><circle cx="48" cy="40" r="8"/>';
const WX_PARTS = {
    sun: '<circle cx="32" cy="32" r="17" fill="url(#wxSun)"/>',
    sunBehind: '<circle cx="23" cy="24" r="13" fill="url(#wxSun)"/>',
    moon: '<path d="M38 12A21 21 0 1 0 54 44A17 17 0 0 1 38 12Z" fill="url(#wxMoon)"/>',
    moonBehind: '<path d="M27 9A15 15 0 1 0 39 32A12 12 0 0 1 27 9Z" fill="url(#wxMoon)"/>',
    cloud: `<g fill="url(#wxCloud)" filter="url(#wxShadow)">${WX_CLOUD}</g>`,
    cloudBack: `<g fill="url(#wxCloudBack)" transform="translate(-6 -10) scale(.9)">${WX_CLOUD}</g>`,
    cloudHigh: `<g fill="url(#wxCloud)" filter="url(#wxShadow)" transform="translate(0 -10)">${WX_CLOUD}</g>`,
    cloudDark: `<g fill="url(#wxCloudDark)" filter="url(#wxShadow)" transform="translate(0 -10)">${WX_CLOUD}</g>`,
    rain: '<path d="M23 47l-3 7M33 47l-3 7M43 47l-3 7" stroke="#3d9cff" stroke-width="3.2" stroke-linecap="round"/>',
    pour: '<path d="M20 46l-4 10M28 46l-4 10M36 46l-4 10M44 46l-4 10" stroke="#2f7fe0" stroke-width="3.2" stroke-linecap="round"/>',
    snow: '<g fill="#fff" stroke="#8fc3ec" stroke-width="1.2"><circle cx="22" cy="51" r="3"/><circle cx="32" cy="56" r="3"/><circle cx="42" cy="51" r="3"/></g>',
    sleet: '<path d="M25 47l-3 7M41 47l-3 7" stroke="#3d9cff" stroke-width="3.2" stroke-linecap="round"/><circle cx="32" cy="54" r="3" fill="#fff" stroke="#8fc3ec" stroke-width="1.2"/>',
    hail: '<g fill="#eef6ff" stroke="#7fa6c8" stroke-width="1.4"><circle cx="22" cy="50" r="3.4"/><circle cx="32" cy="56" r="3.4"/><circle cx="42" cy="50" r="3.4"/></g>',
    bolt: '<path d="M35 38L25 53H32L28 63L42 46H35L39 38Z" fill="#ffc21a" stroke="#e59b00" stroke-width="1" stroke-linejoin="round"/>',
    boltRain: '<path d="M20 47l-3 7M46 47l-3 7" stroke="#3d9cff" stroke-width="3.2" stroke-linecap="round"/><path d="M35 38L25 53H32L28 63L42 46H35L39 38Z" fill="#ffc21a" stroke="#e59b00" stroke-width="1" stroke-linejoin="round"/>',
    fog: '<path d="M14 48H50M20 55H44" stroke="#aab6c4" stroke-width="3.2" stroke-linecap="round"/>',
    wind: '<path d="M8 26H38A6 6 0 1 0 32 20M8 36H48A6 6 0 1 1 42 42M14 46H30" fill="none" stroke="#9fb3c8" stroke-width="3.6" stroke-linecap="round"/>',
    windLow: '<path d="M10 52H40A5 5 0 1 1 35 57M16 60H30" fill="none" stroke="#9fb3c8" stroke-width="3" stroke-linecap="round"/>',
    alert: '<circle cx="32" cy="32" r="20" fill="#ff8a3d"/><path d="M32 21V35" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="43" r="3" fill="#fff"/>',
};
// Home Assistant's weather conditions; [night] replaces the parts after sunset.
const WX_CONDITIONS = {
    sunny: { day: ['sun'], night: ['moon'] },
    'clear-night': { day: ['moon'] },
    partlycloudy: { day: ['sunBehind', 'cloud'], night: ['moonBehind', 'cloud'] },
    cloudy: { day: ['cloudBack', 'cloud'] },
    fog: { day: ['cloudHigh', 'fog'] },
    rainy: { day: ['cloudHigh', 'rain'] },
    pouring: { day: ['cloudDark', 'pour'] },
    snowy: { day: ['cloudHigh', 'snow'] },
    'snowy-rainy': { day: ['cloudHigh', 'sleet'] },
    hail: { day: ['cloudHigh', 'hail'] },
    lightning: { day: ['cloudDark', 'bolt'] },
    'lightning-rainy': { day: ['cloudDark', 'boltRain'] },
    windy: { day: ['wind'] },
    'windy-variant': { day: ['cloudHigh', 'windLow'] },
    exceptional: { day: ['alert'] },
};
const WX_DEFS = `<defs>
    <radialGradient id="wxSun" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffe680"/><stop offset=".6" stop-color="#ffc21a"/><stop offset="1" stop-color="#ffa000"/></radialGradient>
    <linearGradient id="wxMoon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset="1" stop-color="#f5cf62"/></linearGradient>
    <linearGradient id="wxCloud" gradientUnits="userSpaceOnUse" x1="0" y1="18" x2="0" y2="52"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#dde5ef"/></linearGradient>
    <linearGradient id="wxCloudBack" gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="45"><stop offset="0" stop-color="#e3e9f1"/><stop offset="1" stop-color="#b9c4d2"/></linearGradient>
    <linearGradient id="wxCloudDark" gradientUnits="userSpaceOnUse" x1="0" y1="18" x2="0" y2="52"><stop offset="0" stop-color="#b9c3d0"/><stop offset="1" stop-color="#7e8a9a"/></linearGradient>
    <filter id="wxShadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#42566e" flood-opacity=".35"/></filter>
  </defs>`;
const weatherIcon = (condition, day) => {
    const icon = WX_CONDITIONS[condition];
    if (!icon) return '';
    return `<svg viewBox="0 0 64 64" aria-hidden="true">${WX_DEFS}${(day ? icon.day : icon.night ?? icon.day).map(part => WX_PARTS[part]).join('')}</svg>`;
};
const STAT_PERIODS = { Day: '5minute', Week: 'hour', 'Last 7 days': 'hour', Month: 'hour', Year: 'day', Lifetime: 'day' };

// Splits one interval's energy into a sources x consumers matrix with those totals (iterative proportional
// fitting from STAT_AFFINITY), so that sums over many intervals keep when each flow happened.
const allocateFlows = (sources, sinks) => {
    const flows = sources.map(() => sinks.map(() => 0));
    const supply = sources.reduce((a, b) => a + b, 0), demand = sinks.reduce((a, b) => a + b, 0);
    if (supply <= 1e-9 || demand <= 1e-9) return flows;
    const wanted = sinks.map(v => v * supply / demand);
    sources.forEach((source, i) => wanted.forEach((sink, j) => { flows[i][j] = source > 0 && sink > 0 ? STAT_AFFINITY[i][j] : 0; }));
    for (let pass = 0; pass < 60; pass++) {
        flows.forEach((row, i) => {
            const total = row.reduce((a, b) => a + b, 0);
            if (total > 0) row.forEach((_, j) => { row[j] *= sources[i] / total; });
        });
        wanted.forEach((sink, j) => {
            const total = flows.reduce((a, row) => a + row[j], 0);
            if (total > 0) flows.forEach(row => { row[j] *= sink / total; });
        });
    }
    return flows;
};

// Dates and times follow Home Assistant's time zone ([zone]), not the browser's; undefined is the browser's.
const zoneFormats = new Map();
// Wall-clock fields of the instant [t] in [zone].
const zoneParts = (t, zone) => {
    let format = zoneFormats.get(zone);
    if (!format) zoneFormats.set(zone, format = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
    const p = Object.fromEntries(format.formatToParts(t).map(part => [part.type, Number(part.value)]));
    return { y: p.year, m: p.month - 1, d: p.day, h: p.hour, min: p.minute, s: p.second };
};
// Instant of a wall-clock time in [zone]; out-of-range fields roll over as with new Date(y, m, d, h).
const zoneDate = (zone, y, m, d, h = 0) => {
    const wall = Date.UTC(y, m, d, h);
    let t = wall;
    for (let i = 0; i < 2; i++) {
        const p = zoneParts(t, zone);
        t = wall - (Date.UTC(p.y, p.m, p.d, p.h, p.min, p.s) - t);
    }
    return new Date(t);
};
const zoneMidnight = (t, zone) => {
    const { y, m, d } = zoneParts(t, zone);
    return zoneDate(zone, y, m, d);
};

// First and last instant (exclusive) of the range that contains [date].
const statWindow = (range, date, zone) => {
    const { y, m, d } = zoneParts(date, zone), at = (...fields) => zoneDate(zone, ...fields);
    if (range === 'Day') return [at(y, m, d), at(y, m, d + 1)];
    if (range === 'Week') { const start = d - (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7; return [at(y, m, start), at(y, m, start + 7)]; }
    if (range === 'Last 7 days') return [at(y, m, d - 6), at(y, m, d + 1)];
    if (range === 'Month') return [at(y, m, 1), at(y, m + 1, 1)];
    if (range === 'Year') return [at(y, 0, 1), at(y + 1, 0, 1)];
    return [at(2015, 0, 1), new Date()];
};
const statStep = (range, date, direction, zone) => {
    const { y, m, d } = zoneParts(date, zone);
    if (range === 'Day') return zoneDate(zone, y, m, d + direction);
    if (range === 'Week' || range === 'Last 7 days') return zoneDate(zone, y, m, d + 7 * direction);
    if (range === 'Month') return zoneDate(zone, y, m + direction, 1);
    return zoneDate(zone, y + direction, 0, 1);
};
// [format] is the date's fields in order ('DMY', 'MDY' or 'YMD'), their separator and whether the year has two digits;
// a month drops the day. A year on its own keeps four.
const statLabel = (range, date, zone, format = { order: 'YMD', sep: '-' }) => {
    const [start, end] = statWindow(range, date, zone);
    const day = (t, fields = format.order) => {
        const { y, m, d } = zoneParts(t, zone), parts = { Y: format.short ? String(y).slice(-2) : String(y), M: String(m + 1).padStart(2, '0'), D: String(d).padStart(2, '0') };
        return [...fields].map(field => parts[field]).join(format.sep);
    };
    if (range === 'Day') return day(start);
    if (range === 'Week' || range === 'Last 7 days') return `${day(start)} – ${day(new Date(end - 1))}`;
    if (range === 'Month') return day(start, format.order.replace('D', ''));
    return range === 'Year' ? String(zoneParts(start, zone).y) : 'Lifetime';
};
// date_format: DD, MM and YYYY (or YY) in any order, with one separator that isn't a letter or digit.
const DATE_FORMAT = /^(DD|MM|YYYY|YY)([^A-Za-z0-9])(DD|MM|YYYY|YY)\2(DD|MM|YYYY|YY)$/;

// Power given in kW, shown as W below 1 kW and MW from 1000 kW.
const formatPower = kw => {
    const watts = Math.round(Math.abs(kw) * 1000);
    if (watts < 1000) return `${watts} W`;
    const k = Math.abs(kw);
    return k < 999.995 ? `${k.toFixed(2)} kW` : `${(k / 1000).toFixed(2)} MW`;
};
// SigenStor and GRID share one row so their tops line up whatever each one's number of lines;
// the row hangs from its bottom edge, which keeps the taller block inside the scene.
const lowerStyle = (({ left, columns: [first, second], bottom }) =>
    `left:${(left / SCENE.width * 100).toFixed(3)}%;width:${((SCENE.width - left) / SCENE.width * 100).toFixed(3)}%;bottom:${((SCENE.height - bottom) / SCENE.height * 100).toFixed(3)}%;grid-template-columns:${((second - first) / (SCENE.width - left) * 100).toFixed(3)}% auto`)(READINGS.lower);
const placeAt = ([x, y, edge]) => `left:${(x / SCENE.width * 100).toFixed(3)}%;${edge}:${((edge === 'top' ? y : SCENE.height - y) / SCENE.height * 100).toFixed(3)}%`;

class SigenergyFlowCard extends HTMLElement {
    // The parts this card shows, and its defaults over the main card's; the standalone cards change both.
    static tag = 'sigenergy-flow-card';
    static parts = PARTS;
    static defaults = {};
    static size = 12;
    static getStubConfig() {
        return {
            type: `custom:${this.tag}`
        };
    }
    get _solo() {
        return this.constructor.parts.length === 1;
    }
    setConfig(config) {
        const backend = config.sigenergy_backend ?? 'sigenergy_local_modbus';
        if (!Object.hasOwn(BACKENDS, backend)) throw new Error(`Unknown sigenergy_backend "${backend}". Valid values: ${Object.keys(BACKENDS).join(', ')}`);
        if (config.theme !== undefined && !['auto', 'light', 'dark'].includes(config.theme)) throw new Error(`Unknown theme "${config.theme}". Valid values: auto, light, dark`);
        if (config.garage !== undefined && !['auto', 'single', 'double'].includes(config.garage)) throw new Error(`Unknown garage "${config.garage}". Valid values: auto, single, double`);
        for (const keys of CARS) {
            const shown = config[keys.shown], car = config[keys.car];
            if (shown !== undefined && !['auto', true, false].includes(shown) && !/^(binary_sensor|device_tracker)\.[a-z0-9_]+$/.test(shown))
                throw new Error(`Unknown ${keys.shown} "${shown}". Valid values: auto, true, false, a binary_sensor or a device_tracker entity`);
            for (const key of [keys.image, keys.night])
                if (config[key] !== undefined && config[key] !== null && typeof config[key] !== 'string') throw new Error(`${key} must be an image URL`);
            if (car !== undefined && car !== null && !/^([a-z0-9-]+|[a-z_]+\.[a-z0-9_]+)$/.test(car))
                throw new Error(`${keys.car} must be the name of a car in the card's cars folder, e.g. byd-atto3-orange, or an entity whose state is one`);
        }
        const dateFormat = DATE_FORMAT.exec(config.date_format ?? 'auto');
        if (config.date_format !== undefined && config.date_format !== 'auto' && !(dateFormat && new Set([dateFormat[1][0], dateFormat[3][0], dateFormat[4][0]]).size === 3))
            throw new Error(`Unknown date_format "${config.date_format}". Valid values: auto, or DD, MM and YYYY (or YY) in any order with one separator, e.g. DD/MM/YYYY`);
        const periods = Object.keys(PERIODS).filter(period => this._solo || PERIODS[period] !== 'Last 7 days');
        if (config.period !== undefined && !periods.includes(config.period)) throw new Error(`Unknown period "${config.period}". Valid values: ${periods.join(', ')}`);
        const entities = config.entities ?? {};
        if (typeof entities !== 'object' || Array.isArray(entities)) throw new Error('entities must be a mapping of key: entity_id');
        for (const [key, value] of Object.entries(entities)) {
            if (!(key in DEFAULT_ENTITIES)) throw new Error(`Unknown entities key "${key}". Valid keys: ${Object.keys(DEFAULT_ENTITIES).join(', ')}`);
            if (value !== false && value !== null && (typeof value !== 'string' || !value.includes('.'))) throw new Error(`entities.${key} must be an entity ID or false`);
        }
        const tap = config.tap_action;
        if (tap !== undefined && tap !== null && (typeof tap !== 'object' || Array.isArray(tap) || typeof tap.action !== 'string')) throw new Error('tap_action must be a Home Assistant action, e.g. { action: navigate, navigation_path: /energy }');
        if (config.battery_remaining_target !== undefined && !['auto', 'backup_soc', 'discharge_cut_off_soc'].includes(config.battery_remaining_target))
            throw new Error(`Unknown battery_remaining_target "${config.battery_remaining_target}". Valid values: auto, backup_soc, discharge_cut_off_soc`);
        if (config.home_includes_ac_charger !== undefined && typeof config.home_includes_ac_charger !== 'boolean') throw new Error('home_includes_ac_charger must be true or false');
        if (config.weather_scene !== undefined && typeof config.weather_scene !== 'boolean') throw new Error('weather_scene must be true or false');
        if (config.home_entities !== undefined && config.home_entities !== false && config.home_entities !== null && !Array.isArray(config.home_entities)) throw new Error('home_entities must be a list of entities or false');
        this.config = {
            pv_strings: ['PV1', 'PV2', 'PV3', 'PV4'],
            home_entities: [],
            battery_present: true,
            show_lifetime: true,
            show_phase_mode: false,
            show_grid_voltage: false,
            home_includes_ac_charger: false,
            battery_remaining_target: 'auto',
            garage: 'auto',
            weather_scene: true,
            car_shown: 'auto',
            car: null,
            car_image: null,
            car_image_night: null,
            car_shown_2: 'auto',
            car_2: null,
            car_image_2: null,
            car_image_night_2: null,
            grid_phases: null,
            title: 'Sigenergy',
            name: 'My Home',
            show_energy_statistics: true,
            show_forecast: true,
            theme: 'auto',
            debug_energy_statistics: false,
            period: 'day',
            show_period_picker: true,
            tap_action: null,
            date_format: 'auto',
            ...this.constructor.defaults,
            ...config,
            sigenergy_backend: backend,
        };
        this._backend = BACKENDS[backend];
        this._shown = new Set(this.constructor.parts);
        // Each string is a name, which reads the backend's pattern (sensor.sigen_inverter_pv<n>_* for Sigenergy Local
        // Modbus, sensor.sigen_0_inverter_1_pv<n>_* for sigenergy2mqtt), or an object
        // { name, voltage, current, power, daily_energy, accumulated_energy } that uses only the keys it lists.
        // A string none of whose entities exist in Home Assistant is treated as not fitted and hidden.
        this._pv = this.config.pv_strings.map((item, i) => {
            const object = typeof item === 'object' && item !== null;
            const pv = { name: (object ? item.name : item) ?? `PV${i + 1}` };
            for (const key of PV_KEYS) pv[key] = object ? (typeof item[key] === 'string' ? item[key] : null) : this._backend.pvString(i + 1, key);
            return pv;
        });
        this._build();
        if (this.isConnected && !this._flowFrame) this._startFlowAnimation();
    }
    set hass(hass) {
        const previous = this._hass;
        this._hass = hass;
        if (!this.root)
            return;
        this._update();
        this._updateSunTimes();
        this._updateScene();
        if (this._shown.has('scene')) this._updateWeather();
        if (Date.now() - (this._energyDevicesAt ?? 0) > 3600e3) this._loadEnergyDevices();
        const today = new Date().toLocaleDateString('en-CA', { timeZone: this._zone });
        if (!previous || this._day !== today) {
            this._day = today;
            // A view that showed the current day, week… moves on with the clock.
            if (this._stat?.follow) this._stat.date = new Date();
            if (this._shown.has('tiles') || this._shown.has('metrics')) this._loadForecast();
            if (this._shown.has('tiles')) this._loadForecastWeek();
            this._loadView();
        }
    }
    getCardSize() {
        return this.constructor.size;
    }
    _build() {
        if (this._flowFrame) { cancelAnimationFrame(this._flowFrame); this._flowFrame = null; }
        if (!this.shadowRoot)
            this.attachShadow({
                mode: 'open'
            });
        const battery = this.config.battery_present;
        const legend = [...new Map(CHART_SERIES.filter(s => battery || !BATTERY_KEYS.has(s.key)).map(s => [s.name, s])).values()]
            .map(s => `<span id="legend${s.name}"><i class="dot" style="background:${s.color}"></i>${s.name}</span>`).join('')
            + '<span id="legendForecast" hidden><i class="dash"></i>Forecast</span>';
        const head = (id, title) => `<div class="dlg-head"><h2 id="${id}Title">${title}</h2><button title="Close" aria-label="Close">✕</button></div>`;
        const comets = id => COMET_LAYERS.map(() => `<path class="comet" d="${FLOWS[id]}"/>`).join('');
        const flows = Object.keys(FLOWS).map(id => `<g class="flow" id="${id}"><path class="wire" d="${FLOWS[id]}"/><path class="glow" d="${FLOWS[id]}"/>${comets(id)}</g>`).join('');
        const fixed = this.config.show_period_picker ? '' : ' hidden', solo = this._solo, [part] = this.constructor.parts;
        const picker = `<div class="statbar${fixed && ' fixed'}"><div class="statnav"><button id="statPrev" title="Previous" aria-label="Previous"${fixed}>‹</button><span id="statDate">—</span><button id="statNext" title="Next" aria-label="Next"${fixed}>›</button></div><select class="statrange" id="statRange" aria-label="Range"${fixed}>${(solo ? SOLO_RANGES : STAT_RANGES).map(range => `<option>${range}</option>`).join('')}</select></div>`;
        const scene = `<section class="scene" id="scene"><div class="plane" id="plane">
        <svg viewBox="0 0 ${SCENE.width} ${SCENE.height}" preserveAspectRatio="none" aria-label="Energy flow between equipment">
          <defs>
            <linearGradient id="fadeTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fade" stop-opacity=".6"/><stop offset=".5" class="fade" stop-opacity=".35"/><stop offset="1" class="fade" stop-opacity="0"/></linearGradient>
            <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fade" stop-opacity="0"/><stop offset=".45" class="fade" stop-opacity=".26"/><stop offset="1" class="fade" stop-opacity=".44"/></linearGradient>
            <linearGradient id="fadeLeft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="fade" style="stop-opacity:var(--fade-left)"/><stop offset="1" class="fade" stop-opacity="0"/></linearGradient>
            <marker id="leaderDot" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2.2" fill="var(--leader)"/></marker>
          </defs>
          <image class="photo" href="${ARTWORK['house_day.png'].href}" x="0" y="${-PHOTO.bleed}" width="${SCENE.width}" height="${SCENE.height + 2 * PHOTO.bleed}" preserveAspectRatio="none"/>
          <image id="garageArt" display="none" href="${ARTWORK['garage_day.png'].href}" x="${ARTWORK['garage_day.png'].at[0]}" y="${PHOTO.top + ARTWORK['garage_day.png'].at[1]}" width="${ARTWORK['garage_day.png'].size[0]}" height="${ARTWORK['garage_day.png'].size[1]}" preserveAspectRatio="none"/>
          <image id="doubleArt" display="none" x="${DOUBLE_GARAGE.at[0]}" y="${PHOTO.top + DOUBLE_GARAGE.at[1]}" width="${DOUBLE_GARAGE.size[0]}" height="${DOUBLE_GARAGE.size[1]}" preserveAspectRatio="none"/>
          <image id="carArt" display="none" x="${CAR_FRAME.at[0]}" y="${PHOTO.top + CAR_FRAME.at[1]}" width="${CAR_FRAME.size[0]}" height="${CAR_FRAME.size[1]}" preserveAspectRatio="none"/>
          <image id="carArt2" display="none" x="${CAR_FRAME.at[0]}" y="${PHOTO.top + CAR_FRAME.at[1]}" width="${CAR_FRAME.size[0]}" height="${CAR_FRAME.size[1]}" preserveAspectRatio="none" transform="translate(0 ${PHOTO.top}) matrix(${DOUBLE_GARAGE.car.join(' ')}) translate(0 ${-PHOTO.top})"/>
          <image id="chargerArt" display="none" href="${ARTWORK['charger_day.png'].href}" x="${ARTWORK['charger_day.png'].at[0]}" y="${PHOTO.top + ARTWORK['charger_day.png'].at[1]}" width="${ARTWORK['charger_day.png'].size[0]}" height="${ARTWORK['charger_day.png'].size[1]}" preserveAspectRatio="none"/>
          <image id="ledArt" class="led" display="none" href="${ARTWORK['charger_day.png'].href}" x="${ARTWORK['charger_day.png'].at[0]}" y="${PHOTO.top + ARTWORK['charger_day.png'].at[1]}" width="${ARTWORK['charger_day.png'].size[0]}" height="${ARTWORK['charger_day.png'].size[1]}" preserveAspectRatio="none"/>
          <image id="chargerArt2" display="none" href="${ARTWORK['charger_day.png'].href}" x="${ARTWORK['charger_day.png'].at[0]}" y="${PHOTO.top + ARTWORK['charger_day.png'].at[1]}" width="${ARTWORK['charger_day.png'].size[0]}" height="${ARTWORK['charger_day.png'].size[1]}" preserveAspectRatio="none" transform="translate(0 ${PHOTO.top}) matrix(${DOUBLE_GARAGE.car.join(' ')}) translate(0 ${-PHOTO.top})"/>
          <image id="ledArt2" class="led" display="none" href="${ARTWORK['charger_day.png'].href}" x="${ARTWORK['charger_day.png'].at[0]}" y="${PHOTO.top + ARTWORK['charger_day.png'].at[1]}" width="${ARTWORK['charger_day.png'].size[0]}" height="${ARTWORK['charger_day.png'].size[1]}" preserveAspectRatio="none" transform="translate(0 ${PHOTO.top}) matrix(${DOUBLE_GARAGE.car.join(' ')}) translate(0 ${-PHOTO.top})"/>
          <rect x="0" y="${-PHOTO.bleed}" width="${PHOTO.width}" height="${PHOTO.bleed + FADE.topEnd}" class="fadeRect" fill="url(#fadeTop)"/>
          <rect x="0" y="${FADE.bottomStart}" width="${PHOTO.width}" height="${SCENE.height - FADE.bottomStart + PHOTO.bleed}" class="fadeRect" fill="url(#fadeBottom)"/>
          <rect x="0" y="${-PHOTO.bleed}" width="520" height="${SCENE.height + 2 * PHOTO.bleed}" fill="url(#fadeLeft)"/>
          ${LEADERS.map((d, i) => battery || i !== 3 ? `<path class="leader${i === 3 ? ' lowerLeader noDot' : i === 2 || i === 4 ? ' noDot' : ''}" data-d="${d}" d="${d}"/>` : '').join('')}
          ${flows}
        </svg>
        <div class="node weather" id="weather" hidden><button id="weatherButton" title="Show the weather forecast"><span id="weatherIcon"></span><strong id="weatherTemp"></strong></button></div>
        <div class="node lead" style="${placeAt(READINGS.pv)}"><button id="pvButton" title="Show PV string details"><strong id="pv">—</strong><small>SOLAR</small></button></div>
        <div class="node lead" id="homeLead" style="${placeAt(READINGS.home)}"><button id="homeButton" title="Show home power usage" disabled><strong id="home">—</strong><small>HOME</small></button></div>
        <div class="lower" style="${lowerStyle}">
          <div class="node"><button id="gridButton" title="Show grid details"><strong id="grid">—</strong><small>GRID <span class="nobreak"><span id="gridLabel"></span><span id="gridMore"> ›</span></span></small></button><em id="gridStatus"></em><em id="phaseMode"></em></div>
          ${battery ? '<div class="node"><strong id="battery">—</strong><small>SigenStor · <button id="socButton" title="Show battery level history"><span id="soc">—</span></button></small><em id="battStatus"></em></div>' : ''}
        </div>
        <div class="sidecol" id="chargers">
          <div class="node" id="acNode"><strong id="ac">—</strong><small>AC CHARGER</small><em id="acSoc"></em><em id="acTotal"></em></div>
          <div class="node" id="dcNode"><button id="dcButton" title="Adjust DC charging power limit"><strong id="dc">—</strong><small>DC CHARGER<span id="dcGear"> ⚙</span></small><em id="dcSoc"></em><em id="dcLifetime" class="lifetime stack"></em></button></div>
        </div>
      </div></section>`;
        const batteryLevel = `<button class="link" id="socLevel"><strong id="socLarge">—</strong><div class="socbar"><div class="socfill" id="socFill"></div></div></button><button class="link muted" id="capacity" title="Show stored energy today"><span id="capacityText"></span></button>`;
        const tiles = `<div class="stats"${battery ? '' : ' style="grid-template-rows:repeat(2,minmax(10px,1fr) auto auto auto minmax(10px,1fr) 9px)"'}>
          ${DAILY_TILES.filter(([, key]) => battery || !BATTERY_KEYS.has(key)).map(([id, , label], i) => `<button class="stat" style="grid-row-start:${6 * Math.floor((i && i + 1) / 2) + 1}"><small>${label}<span class="gap" id="${id}Gap" title="Missing data" hidden>⚠</span></small><b id="${id}">—</b></button>`
              + (id === 'dayPv' ? '<button class="stat" id="forecastStat" style="grid-row-start:1" hidden><small>Solar forecast</small><b id="dayForecast">—</b><small id="forecastPerf"></small></button>' : '')).join('')}
        </div>`;
        const metrics = `<div class="legend" id="legendPower">${legend}</div><div class="legend" id="legendBars" hidden></div>
      <div class="chart-wrap"><svg id="chart"></svg><div class="tip" id="chartTip" hidden></div><div class="busy" id="chartBusy" hidden></div></div><div class="sun-times" id="sunTimes"><span id="sunrise">Sunrise —</span><span id="sunset">Sunset —</span></div>`;
        const sankey = `<div class="chart-wrap"><svg id="statChart" role="group" aria-label="Energy flows, estimated"></svg><div class="busy" id="statBusy" hidden></div></div><div class="statsum" id="statSummary" hidden></div><div class="statcards" id="statCards"></div><pre class="muted" id="statDebug" hidden></pre><div class="statdata" id="statData" hidden><button id="statCopy">Copy the recorded data</button><a id="statDownload" download="sigenergy-statistics.json">Download (JSON)</a><span class="muted" id="statCopied"></span></div>`;
        const dialogs = {
            pvDialog: `
    <dialog id="pvDialog" aria-labelledby="pvTitle"><div class="dlg">
      ${head('pv', 'PV Strings')}
      <section class="panel"><h3>PV real time info</h3><div class="pv-wrap"><table class="pv-table">
        <thead><tr><th></th><th>Voltage<br>(V)</th><th>Current<br>(A)</th><th>Power<br>(kW)</th><th>Today<br>(kWh)</th><th>Lifetime<br>(kWh)</th></tr></thead>
        <tbody>${this._pv.map(({ name }, i) => `<tr id="pvRow${i}"><th scope="row"><i class="dot" style="background:${PV_COLORS[i % PV_COLORS.length]}"></i></th>${['voltage', 'current', 'power', 'daily_energy', 'accumulated_energy'].map(k => `<td id="pv${i}_${k}">—</td>`).join('')}</tr>`).join('')}</tbody>
        <tfoot><tr id="pvThirdRow" hidden><th scope="row"><i class="dot" style="background:var(--pv-third)"></i>Third-party PV</th><td></td><td></td><td id="pvThird_power">—</td><td id="pvThird_daily_energy">—</td><td id="pvThird_accumulated_energy">—</td></tr><tr><th scope="row">Total</th><td></td><td></td><td id="pvTotal_power">—</td><td id="pvTotal_daily_energy">—</td><td id="pvTotal_accumulated_energy">—</td></tr></tfoot>
      </table></div><div class="muted" id="pvLifetimeNote" hidden>String lifetimes are counted by the integration and may miss past production. Total is the inverter's own counter.</div></section>
      <section class="panel"><div class="charthead"><h3>PV power (kW) · Today</h3><span class="muted" id="pvChartStatus"></span></div>
      <div class="legend">${this._pv.map(({ name }, i) => `<span id="pvLegend${i}"><i class="dot" style="background:${PV_COLORS[i % PV_COLORS.length]}"></i></span>`).join('')}<span id="pvLegendThird" hidden><i class="dot" style="background:var(--pv-third)"></i>Third-party PV</span></div>
      <div class="chart-wrap"><svg id="pvChart"></svg><div class="tip" id="pvChartTip" hidden></div></div></section>
    </div></dialog>`,
            gridDialog: `
    <dialog id="gridDialog" aria-labelledby="gridTitle"><div class="dlg">
      ${head('grid', 'Grid')}
      <section class="panel"><h3>Real time info</h3><div class="pv-wrap"><table class="pv-table">
        <thead><tr><th></th>${GRID_KINDS.map(kind => `<th data-column="${kind}">${GRID_HEADS[kind][0]}<br>${GRID_HEADS[kind][1]} (${GRID_UNITS[kind]})</th>`).join('')}</tr></thead>
        <tbody>${GRID_PHASES.map(phase => `<tr id="gridRow_${phase}"><th scope="row">Phase ${phase.toUpperCase()}</th>${GRID_KINDS.map(kind => `<td class="pick" data-column="${kind}"><button id="grid_${phase}_${kind}" data-phase="${phase}" data-kind="${kind}">—</button></td>`).join('')}</tr>`).join('')}</tbody>
      </table></div><div class="muted" id="gridNote"><span id="gridNoteInverter">Inverter: the first inverter's readings at its AC terminals.</span> <span id="gridNoteGrid">Grid: the grid sensor's active power, positive while importing.</span></div><button class="gridpf" id="gridPf" data-kind="power_factor">Inverter power factor <span id="gridPfValue">—</span></button></section>
      <section class="panel"><div class="charthead"><h3 id="gridChartTitle"></h3><span class="muted" id="gridChartStatus"></span></div>
      <div class="chart-wrap"><svg id="gridChart"></svg><div class="tip" id="gridChartTip" hidden></div></div></section>
    </div></dialog>`,
            energyDialog: `
    <dialog id="energyDialog" aria-labelledby="energyTitle"><div class="dlg">
      ${head('energy', 'Battery energy')}
      <section class="panel"><div class="home-total"><span>Stored now</span><b id="energyNow">—</b></div><div class="muted" id="energyOf"></div></section>
      <section class="panel"><div class="charthead"><h3>Stored energy (kWh) · Today</h3><span class="muted" id="energyChartStatus"></span></div>
      <div class="chart-wrap"><svg id="energyChart"></svg><div class="tip" id="energyChartTip" hidden></div></div></section>
    </div></dialog>`,
            socDialog: `
    <dialog id="socDialog" aria-labelledby="socTitle"><div class="dlg">
      ${head('soc', 'Battery level')}
      <section class="panel"><div class="home-total"><span>State of charge</span><b id="socNow">—</b></div></section>
      <section class="panel"><div class="charthead"><h3>State of charge (%) · Today</h3><span class="muted" id="socChartStatus"></span></div>
      <div class="chart-wrap"><svg id="socChart"></svg><div class="tip" id="socChartTip" hidden></div></div></section>
    </div></dialog>`,
            homeDialog: `
    <dialog id="homeDialog" aria-labelledby="homeTitle"><div class="dlg">
      ${head('home', 'Home power usage')}
      <section class="panel"><div class="home-total"><span>Home consumption</span><b id="homeTotal">—</b></div><div class="muted" id="homeMeasured"></div><div class="homewarn" id="homeWarn" hidden>⚠ The listed loads exceed the home consumption: some may be counted twice. In the Energy dashboard, set the Upstream device of a device measured by another.</div></section>
      <section class="panel"><div class="loads" id="homeLoads"></div></section>
    </div></dialog>`,
            forecastDialog: `
    <dialog id="forecastDialog" aria-labelledby="forecastTitle"><div class="dlg">
      ${head('forecast', 'Solar performance')}
      <section class="panel"><div class="home-total"><span>Performance today</span><b id="forecastPerfNow">—</b></div><div class="muted" id="forecastSummary"></div><button class="link muted" id="forecastEntity" hidden>Forecast details ›</button></section>
      <section class="panel"><div class="charthead"><h3>Solar produced and forecast (kWh) · Today</h3><span class="muted" id="forecastChartStatus"></span></div>
      <div class="legend"><span><i class="dot" style="background:var(--c-solar)"></i>Produced</span><span><i class="dot" style="background:var(--sub)"></i>Forecast</span></div>
      <div class="chart-wrap"><svg id="forecastChart"></svg><div class="tip" id="forecastChartTip" hidden></div></div></section>
    </div></dialog>`,
        };
        // A standalone card is its part under a header that holds what the panel's heading held.
        // With a tap_action, the title ends with a › (the tap itself is handled by the card).
        const more = this._tapAction() ? '<span class="more"> ›</span>' : '';
        const header = (heading, sub = '', bar = picker) => `<div class="header"><div class="title"><div class="heading">${heading}</div>${sub}</div>${bar}</div>`;
        const body = !solo ? `<div class="header"><div class="title"><div class="heading"><span id="heading"></span>${more}</div><div class="sub">Live power flow</div></div>${picker}<div class="sub" id="stamp"></div></div>
      <div class="frame"><div class="layout">${scene}<aside class="sidebar fill">${battery ? `<section class="panel"><h3>Battery level</h3>${batteryLevel}</section>` : ''}
        <section class="panel daypanel"><h3>Energy statistics</h3>${tiles}</section>
      </aside></div></div>
      <section class="panel chartpanel"><div class="charthead"><h3 id="chartTitle">Power metrics · Today</h3><span class="muted" id="chartStatus">Loading history…</span></div>
      ${metrics}</section>
      <section class="panel statpanel" id="statPanel"${this.config.show_energy_statistics ? '' : ' hidden'}><div class="charthead"><h3>Energy statistics<button class="gap" id="statGap" title="Missing data" hidden>⚠</button></h3><span class="muted" id="statStatus">Loading…</span></div>
      ${sankey}</section>` : {
            scene: () => header(`<span id="heading"></span>${more}`, '<div class="sub">Live power flow</div>', '<div class="sub" id="stamp"></div>') + scene,
            battery: () => header(`<span id="heading"></span>${more}`, '', '') + (battery ? batteryLevel : ''),
            tiles: () => header(`<span id="heading"></span>${more}`) + tiles,
            metrics: () => header(`<span id="heading"></span><span id="chartTitle"${this.config.title ? ' hidden' : ''}>Power metrics · Today</span>${more}`, '<div class="sub" id="chartStatus">Loading history…</div>') + metrics,
            sankey: () => header(`<span id="heading"></span>${more}<button class="gap" id="statGap" title="Missing data" hidden>⚠</button>`, '<div class="sub" id="statStatus">Loading…</div>') + sankey,
        }[part]();
        const dialogIds = !solo ? Object.keys(dialogs) : { scene: ['pvDialog', 'gridDialog', 'socDialog', 'homeDialog'], battery: ['energyDialog'], tiles: ['forecastDialog'] }[part] ?? [];
        this.shadowRoot.innerHTML = `<style>
      :host{display:block;color:var(--fg);font-family:Roboto,Arial,sans-serif;${styleVars('night')}}
      :host([light]){${styleVars('day')}}
      [hidden]{display:none !important}
      button *{pointer-events:none}
      ha-card.tappable{cursor:pointer}
      ha-card{container-type:inline-size;display:block;background:var(--card);border:1px solid var(--card-line);border-radius:16px;overflow:hidden;color:inherit;padding:16px;box-sizing:border-box}
      .header{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'title bar' 'title stamp';align-items:center;gap:4px 12px;margin-bottom:14px}.header>.title{grid-area:title}.header>#stamp{grid-area:stamp;justify-self:end}
      .heading{font-size:20px;font-weight:650;letter-spacing:.2px}.sub{font-size:12px;color:var(--sub)}
      .layout{display:grid;grid-template-columns:minmax(0,2.4fr) minmax(240px,.75fr);gap:14px}
      .scene{position:relative;overflow:hidden;border-radius:12px;background:var(--scene);height:${SCENE.height}px}
      .plane{position:absolute;top:0;left:0;width:${SCENE.width}px;height:${SCENE.height}px;--s:1}
      .plane>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
      .fade{stop-color:var(--fade)}.fadeRect{opacity:var(--fade-opacity)}
      .leader{fill:none;stroke:var(--leader);stroke-width:1;vector-effect:non-scaling-stroke;stroke-linecap:round;opacity:.75;marker-end:url(#leaderDot)}
      .leader.noDot{marker-end:none}
      .wire{fill:none;stroke:rgba(18,26,30,.4);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;transition:stroke .4s}
      .flow.active .wire{stroke:var(--wire-on)}
      .glow,.comet{fill:none;stroke:var(--comet);stroke-linecap:round;stroke-linejoin:round;display:none}
      .glow{stroke-width:9;opacity:.6}.comet{stroke-width:3.4;opacity:.3}
      .flow.active.moving .glow,.flow.active.moving .comet{display:inline}
      .node{position:absolute;z-index:2;color:var(--node-fg);white-space:nowrap;line-height:1.2;text-shadow:var(--node-shadow)}
      .node strong{display:block;font-size:clamp(14px,calc(27px * var(--s)),30px);font-weight:580}
      .node small,.node em{font-weight:500}
      .node small{display:block;font-size:clamp(11px,calc(19px * var(--s)),20px);color:var(--node-sub);margin-top:.15em;letter-spacing:.3px}
      .node em{display:block;font-size:clamp(10px,calc(13px * var(--s)),14px);font-style:normal;color:var(--node-em);margin-top:.2em}
      .node em:empty{display:none}
      .narrow .node strong{font-size:clamp(13px,calc(22px * var(--s)),24px)}
      .narrow .node small{font-size:clamp(10px,calc(16px * var(--s)),17px)}
      .narrow .node em{font-size:clamp(9px,calc(11px * var(--s)),12px)}
      #acTotal{color:var(--node-sub);font-weight:460;opacity:.82}
      .node em.stack span{display:block}.node em.stack span+span::before{content:none}
      .compact .node em.lifetime:not(.stack) span{display:inline}.compact .node em.lifetime:not(.stack) span+span::before{content:' · '}
      .node em span+span::before{content:' · '}
      ${CUSTOM_SCENE ? '.narrow .lead{transform:none;text-align:left}' : '.narrow .lead{transform:translateX(calc(-100% - 24px * var(--s)));text-align:right}'}
      .compact .sidecol .node{max-width:calc(430px * var(--s))}.narrow .sidecol .node{max-width:calc(230px * var(--s))}.compact .sidecol em{white-space:normal}
      .compact .lower .node+.node{max-width:calc(260px * var(--s))}.narrow .lower .node+.node{max-width:calc(260px * var(--s))}.compact .lower em{white-space:normal}
      .compact .node em span{display:block}.compact .node em span+span::before{content:none}
      .node.weather button{display:flex;align-items:center;gap:calc(10px * var(--s))}.weather svg{width:clamp(30px,calc(58px * var(--s)),62px);height:clamp(30px,calc(58px * var(--s)),62px);overflow:visible}
      .sidecol{position:absolute;top:50%;transform:translateY(-50%);z-index:2;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;gap:max(14px,calc(24px * var(--s)));min-height:calc(184px * var(--s))}
      .double #chargers{flex-direction:row;top:auto;bottom:${((SCENE.height - READINGS.lower.bottom) / SCENE.height * 100).toFixed(3)}%;transform:none;min-height:0;gap:max(14px,calc(40px * var(--s)))}
      .lower{position:absolute;z-index:2;display:grid;align-items:start}.lower .node{position:static}.lower>.node:first-child{min-width:0;padding-left:calc(43px * var(--s));padding-right:calc(12px * var(--s));transform:translateY(calc(-20px * var(--s)))}.lower>.node:first-child em{white-space:normal}
      .sidecol .node{position:static}
      .node button{all:unset;cursor:pointer;display:block}.node button[disabled]{cursor:default}.nobreak{white-space:nowrap}.narrow #gridButton small{white-space:normal}.node small button{display:inline}.node button:focus-visible{outline:2px solid #71d3d1}
      .sidebar{display:flex;flex-direction:column;gap:12px}.panel{background:var(--panel);border:1px solid var(--panel-line);border-radius:12px;padding:13px}
      .panel h3{margin:0 0 11px;font-size:14px;font-weight:600;color:var(--heading)}
      /* Each row of tiles is five tracks: space, label, value, notes, space, then the gap to the next row. The tiles share
         them (subgrid), so labels and values line up across a row however they wrap. */
      .stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:9px;grid-template-rows:repeat(3,minmax(10px,1fr) auto auto auto minmax(10px,1fr) 9px);margin-bottom:-9px}
      .sidebar.fill>.daypanel{flex:1;display:flex;flex-direction:column}.sidebar.fill .stats{flex:1}.stat.wide{grid-column:1/-1}
      .stat{all:unset;box-sizing:border-box;background:var(--tile);border-radius:8px;padding:10px;cursor:pointer;transition:background .2s}.stat:hover{background:var(--tile-hover)}.stat[disabled]{cursor:default}.stat[disabled]:hover{background:var(--tile)}.stat:focus-visible{outline:2px solid #71d3d1}.stat small{font-size:11px;color:var(--tile-sub);display:block}.stat b{font-size:18px;display:block;margin-top:4px}#forecastPerf{margin-top:4px}#forecastPerf span{display:block}
      .stat{grid-row-end:span 5;display:grid;grid-template-rows:minmax(10px,1fr) auto auto auto minmax(10px,1fr);grid-template-rows:subgrid;padding-block:0}
      .stat>small:first-child{grid-row:2}.stat>b{grid-row:3}#forecastPerf{grid-row:4}
      .link{all:unset;box-sizing:border-box;display:block;width:100%;cursor:pointer;border-radius:6px}.link:hover{filter:brightness(1.2)}.link:focus-visible{outline:2px solid #71d3d1}
      .socbar{height:10px;background:var(--bar);border-radius:8px;overflow:hidden;margin:9px 0}.socfill{height:100%;background:var(--bar-fill);width:0%;transition:width .5s}
      .statpanel{margin-top:14px}.statbar{grid-area:bar;display:flex;gap:10px;align-items:center;justify-content:flex-end}
      .statnav{display:flex;align-items:center;gap:4px;min-width:0;background:var(--tile);border-radius:10px;padding:3px}.statnav>span{flex:0 1 auto;min-width:170px;text-align:center;font-size:14px;font-variant-numeric:tabular-nums}.statnav>span>span{white-space:nowrap}
      .statnav button{all:unset;cursor:pointer;width:34px;height:30px;text-align:center;font-size:20px;line-height:30px;border-radius:8px;color:var(--icon)}.statnav button:hover{background:var(--tile-hover)}.statnav button[disabled]{opacity:.3;cursor:default}.statnav button:focus-visible,.statrange:focus-visible{outline:2px solid #71d3d1}
      .statbar.fixed .statnav{background:none;padding:0}.statbar.fixed .statnav>span{min-width:0;color:var(--sub)}
      .statrange{appearance:none;-webkit-appearance:none;background:var(--tile);color:var(--fg);border:1px solid var(--panel-line);border-radius:10px;padding:7px 28px 7px 12px;font:inherit;font-size:14px;cursor:pointer}
      #statChart{width:100%;display:block}.skn{cursor:pointer;transition:opacity .2s}.skn:focus-visible{outline:none}.skn:focus-visible rect.skbox{stroke:#71d3d1;stroke-width:2}.skr{opacity:.5;transition:opacity .2s}.skr.on{opacity:.8}.skr.dim{opacity:.1}.skn.dim{opacity:.3}
      .sktext{font-family:inherit;fill:#142024;pointer-events:none}.skpct{font-family:inherit;font-size:11px;fill:var(--fg);pointer-events:none;paint-order:stroke;stroke:var(--panel);stroke-width:3px}
      .statsum{text-align:center;margin:12px 0 8px;padding:10px;border:1px solid var(--panel-line);border-radius:12px}.statsum b{font-size:24px}.statsum small{font-size:13px;color:var(--sub);margin-left:4px}.statsum div{color:var(--sub);font-size:14px;margin-top:2px}
      .statdata{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-top:8px;font-size:13px}.statdata button{all:unset;cursor:pointer;color:var(--c-battery)}.statdata a{color:var(--c-battery);cursor:pointer}
      .statpanel pre{user-select:text;-webkit-user-select:text;white-space:pre-wrap;font-family:inherit;font-size:12px;margin:10px 0 0}
      .statcards{display:flex;flex-wrap:wrap;gap:9px}.statcard{flex:1 1 140px;box-sizing:border-box;background:var(--tile);border-radius:10px;padding:10px 12px}.statcard b{font-size:18px;display:block}.statcard span{font-size:13px;color:var(--tile-sub);display:block}
      .chartpanel{margin-top:14px}.charthead{display:flex;justify-content:space-between;align-items:center}.legend{font-size:11px;color:var(--legend)}
      .legend span{margin-right:12px}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}.dash{display:inline-block;width:14px;border-top:2px dashed var(--legend);vertical-align:middle;margin-right:4px}
      .sun-times{display:flex;justify-content:space-between;gap:12px;margin-top:10px;padding:10px 15px;border-radius:24px;background:var(--pill);color:var(--pill-fg);font-size:12px}
      #chart,#pvChart{width:100%;height:170px;display:block;touch-action:pan-y}.muted{color:var(--muted);font-size:12px}
      .chart-wrap{position:relative}.gap{all:unset;cursor:pointer;color:#e0a030;margin-left:4px}.gap[hidden]{display:none}.note{position:fixed;z-index:20;max-width:270px;background:var(--tip);color:inherit;border:1px solid var(--tip-line);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.45;box-shadow:0 6px 18px var(--tip-shadow)}.note[hidden]{display:none}.tip .gaptip{color:#d08a16;white-space:normal;max-width:250px}.busy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}.busy[hidden]{display:none}.busy::after{content:'';width:22px;height:22px;border:2.5px solid var(--grid);border-top-color:var(--axis);border-radius:50%;animation:busy .8s linear infinite}@keyframes busy{to{transform:rotate(360deg)}}.led{animation:led 1.8s ease-in-out infinite}@keyframes led{0%,100%{opacity:.35}50%{opacity:1}}@media (prefers-reduced-motion:reduce){.led{animation:none}}
      .tip{position:absolute;top:4px;z-index:3;pointer-events:none;background:var(--tip);border:1px solid var(--tip-line);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.5;white-space:nowrap;box-shadow:0 6px 18px var(--tip-shadow);font-variant-numeric:tabular-nums}
      .tip b{display:block;font-size:12px;color:var(--heading);margin-bottom:2px}
      .tip div{display:flex;align-items:center;gap:6px}.tip span{margin-left:auto;padding-left:14px;color:var(--fg)}.tip em{font-style:normal;color:var(--muted)}
      dialog{background:var(--dialog);color:var(--fg);border:1px solid var(--dialog-line);border-radius:16px;padding:0;width:min(760px,calc(100vw - 24px));max-height:calc(100vh - 32px);box-sizing:border-box;font-family:Roboto,Arial,sans-serif}
      dialog::backdrop{background:rgba(0,0,0,.6)}
      .dlg{padding:16px;display:flex;flex-direction:column;gap:14px}
      .dlg-head{display:flex;justify-content:space-between;align-items:center}.dlg-head h2{margin:0;font-size:18px;font-weight:600}
      .dlg-head button{all:unset;cursor:pointer;font-size:20px;line-height:1;padding:4px 8px;border-radius:8px;color:var(--icon)}.dlg-head button:focus-visible{outline:2px solid #71d3d1}
      .pv-wrap{overflow-x:auto}
      .pv-table{width:100%;border-collapse:separate;border-spacing:6px;font-size:14px;font-variant-numeric:tabular-nums}
      .pv-table th{font-size:12px;font-weight:500;color:var(--sub);text-align:center;padding:0 4px}
      .pv-table td{background:var(--tile);border-radius:8px;padding:9px 8px;text-align:center;white-space:nowrap}
      .pv-table th[scope=row]{text-align:left;font-size:13px;color:var(--fg);white-space:nowrap}
      .pv-table tfoot td{background:transparent;color:var(--heading);font-weight:600}
      .pv-table .dot{margin-right:6px}
      .pv-table td.pick{padding:0}.pick button{all:unset;box-sizing:border-box;display:block;width:100%;padding:9px 8px;border-radius:8px;cursor:pointer}.pick button[disabled]{cursor:default}
      .pick button[aria-pressed=true],.gridpf[aria-pressed=true]{outline:2px solid var(--c-grid);outline-offset:-2px}.pick button:focus-visible,.gridpf:focus-visible{outline:2px solid #71d3d1}
      #gridNote,#pvLifetimeNote{margin:4px 14px 0}.gridpf{all:unset;cursor:pointer;display:inline-block;margin:6px 6px 0;padding:4px 8px;border-radius:8px;font-size:14px;font-variant-numeric:tabular-nums}
      .loads{display:flex;flex-direction:column;gap:6px}
      .load{all:unset;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) auto 3.5em;gap:2px 12px;align-items:center;background:var(--tile);border-radius:8px;padding:9px 12px;cursor:pointer;font-size:14px;font-variant-numeric:tabular-nums}
      .load:focus-visible{outline:2px solid #71d3d1}
      .load .name{display:flex;align-items:center;gap:8px;min-width:0}.load .name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .load ha-icon{--mdc-icon-size:18px;color:var(--icon);flex:none}
      .load .pct{color:var(--muted);font-size:12px;text-align:right}
      .load .bar{grid-column:1/-1;height:4px;border-radius:2px;background:var(--load-bar);overflow:hidden}.load .bar i{display:block;height:100%;background:var(--load-fill)}
      .homewarn{color:#d08a16;font-size:12px;margin-top:6px}.homewarn[hidden]{display:none}
      .load.other{cursor:default;background:transparent;border:1px dashed var(--other-line)}.load.other .bar i{background:var(--other-fill)}
      .home-total{display:flex;justify-content:space-between;align-items:baseline;font-size:14px;color:var(--icon)}.home-total b{font-size:22px;color:var(--fg)}
      .frame{container-type:inline-size}
      @container (max-width:800px){.layout{grid-template-columns:1fr}}
      @container (max-width:680px){.header{grid-template-areas:'title stamp' 'bar bar'}.statbar{justify-content:space-between;margin-top:8px}}
      @container (max-width:420px){.statnav>span{min-width:0}}
    </style>
    <ha-card${more && ' class="tappable"'}>${body}
    </ha-card><div class="note" id="gapNote" role="status" hidden></div>${dialogIds.map(id => dialogs[id]).join('')}`;
        this.root = this.shadowRoot;
        this._id('heading').textContent = [this.config.title, this.config.name].filter(Boolean).join(' · ');
        // The PV string names come from the card config, so they go in as text rather than through the template.
        if (this._id('pvDialog')) this._pv.forEach(({ name }, i) => {
            this._id(`pvRow${i}`).querySelector('th').append(String(name));
            this._id(`pvLegend${i}`).append(String(name));
        });
        this._sceneFile = null;
        // An image that doesn't load (a misspelt or removed car, or GitHub out of reach) is left out: a car leaves the
        // built-in one, the double garage the single one.
        this._failed ??= new Set();
        for (const id of ['carArt', 'carArt2', 'doubleArt'])
            this._id(id)?.addEventListener('error', event => {
                const href = event.target.getAttribute('href');
                if (!href || this._failed.has(href)) return;
                console.warn(`sigenergy-flow-card: image not found: ${href}`);
                this._failed.add(href);
                this._showCars();
            });
        // The double garage shows once its overlay has loaded, so the new bay's car never stands in the trees.
        this._loaded ??= new Set();
        this._id('doubleArt')?.addEventListener('load', event => {
            this._loaded.add(event.target.getAttribute('href'));
            this._showCars();
        });
        this._loadRows = new Map();
        this._loadsEmpty = null;
        this._flowItems = !this._shown.has('scene') ? [] : Object.keys(FLOWS).map(id => {
            const group = this._id(id);
            return { id, group, wire: group.querySelector('.wire'), length: 0, glow: group.querySelector('.glow'), comets: [...group.querySelectorAll('.comet')] };
        });
        for (const item of this._flowItems)
            item.parent = this._flowItems.find(other => other.id === BRANCHES[item.id]);
        // Each dialog: the button that opens it, and what it shows when it opens. A dialog closes with its ✕ or a click
        // on its backdrop.
        for (const [button, id, show] of [
            ['pvButton', 'pvDialog', () => { this._updatePv(); this._loadPvHistory(); }],
            ['gridButton', 'gridDialog', () => { this._updateGrid(); this._loadGridHistory(); }],
            ['homeButton', 'homeDialog', () => this._updateHome()],
            ['capacity', 'energyDialog', () => { this._updateEnergy(); this._loadEnergyHistory(); }],
            ['socButton', 'socDialog', () => { this._updateSoc(); this._loadSocHistory(); }],
            ['forecastStat', 'forecastDialog', () => { this._updateForecastDialog(); this._loadForecastChart(); }],
        ]) if (this._id(id)) this._id(button)?.addEventListener('click', () => { this._id(id).showModal(); show(); });
        for (const d of this.root.querySelectorAll('dialog')) {
            d.querySelector('.dlg-head button').addEventListener('click', () => d.close());
            d.addEventListener('click', e => { if (e.target === d) d.close(); });
        }
        // A modal dialog sits above HA's more-info dialog, so it closes first.
        this._id('homeLoads')?.addEventListener('click', e => {
            const entityId = e.target.closest('[data-entity]')?.dataset.entity;
            if (!entityId) return;
            this._id('homeDialog').close();
            this._moreInfo(entityId);
        });
        this._id('forecastEntity')?.addEventListener('click', () => {
            this._id('forecastDialog').close();
            this._moreInfo(this._ent('solar_forecast_today'));
        });
        // A grid reading or the power factor charts its history.
        this._gridPick ??= { phase: 'a', kind: 'voltage' };
        this._id('gridDialog')?.addEventListener('click', e => {
            const pick = e.target.closest('[data-kind]');
            if (!pick || pick.disabled) return;
            this._gridPick = { phase: pick.dataset.phase ?? null, kind: pick.dataset.kind };
            this._updateGrid();
            this._loadGridHistory();
        });
        for (const stat of this.root.querySelectorAll('.stat:not(#forecastStat), #socLevel'))
            stat.addEventListener('click', e => {
                const gap = e.target.closest('.gap');
                if (gap) { e.stopPropagation(); this._showNote(gap); }
                else this._moreInfo(stat.dataset.entity);
            });
        this._id('statGap')?.addEventListener('click', e => this._showNote(e.currentTarget));
        // A missing-data mark explains itself on hover or tap; the note closes on the next tap elsewhere.
        for (const gap of this.root.querySelectorAll('.gap')) {
            gap.addEventListener('pointerenter', () => this._showNote(gap));
            gap.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') this._id('gapNote').hidden = true; });
        }
        this.root.addEventListener('pointerdown', e => { if (!e.target.closest?.('.gap')) this._id('gapNote').hidden = true; });
        // tap_action runs on a tap anywhere but the card's own controls: buttons, the range, links, the metrics chart (a
        // tap shows its tip) and the Sankey's nodes. On the full card, only the header and the scene: its panels are
        // where the period is explored.
        const tap = this._tapAction(), skip = `button, select, a, #chart, [data-side]${this._solo ? '' : ', .sidebar, .chartpanel, .statpanel'}`;
        if (tap) this.root.querySelector('ha-card').addEventListener('click', e => {
            if (e.composedPath().some(el => el.matches?.(skip))) return;
            this.dispatchEvent(new CustomEvent('hass-action', { bubbles: true, composed: true, detail: { config: { entity: tap.entity, tap_action: tap }, action: 'tap' } }));
        });
        this._observeCharts();
        for (const [chart, tip] of [['chart', 'chartTip'], ['pvChart', 'pvChartTip'], ['gridChart', 'gridChartTip'], ['energyChart', 'energyChartTip'], ['socChart', 'socChartTip'], ['forecastChart', 'forecastChartTip']]) {
            const svg = this._id(chart), box = this._id(tip);
            if (!svg) continue;
            const show = e => this._hoverChart(svg, box, e);
            svg.addEventListener('pointermove', show);
            svg.addEventListener('pointerdown', show);
            svg.addEventListener('pointerleave', () => this._hideHover(svg, box));
        }
        this._id('dcButton')?.addEventListener('click', () => this._moreInfo(this._ent('dc_charger_limit')));
        this._id('weatherButton')?.addEventListener('click', () => this._moreInfo(this._ent('weather')));
        this._weatherKey = null;
        this._wireStatistics();
        if (this._flowStates) for (const id of Object.keys(this._flowStates)) this._applyFlowClass(id);
    }
    _observeCharts() {
        if (this._chartObserver) this._chartObserver.disconnect();
        this._chartObserver = new ResizeObserver(entries => {
            for (const entry of entries) (entry.target._redraw ?? entry.target.fit)?.();
        });
        for (const id of ['chart', 'pvChart', 'gridChart', 'energyChart', 'socChart', 'forecastChart', 'statChart']) if (this._id(id)) this._chartObserver.observe(this._id(id));
        const scene = this._id('scene'), sidebar = this.root.querySelector('.sidebar');
        if (!scene) return;
        scene.fit = () => this._fitScene();
        if (sidebar) sidebar.fit = scene.fit;
        this._chartObserver.observe(scene);
        for (const el of [this.root.querySelector('.lower'), this._id('chargers')]) {
            el.fit = scene.fit;
            this._chartObserver.observe(el);
        }
        if (sidebar) this._chartObserver.observe(sidebar);
    }
    // The lifetime parts (charged, discharged) share a line when it fits beside the garage, else stack;
    // with a single charger the line must also stop short of the charger on the garage wall.
    _stackLifetime(narrow, scale) {
        const art = ARTWORK['charger_day.png'], single = this._id('acNode').hidden !== this._id('dcNode').hidden;
        const double = this._id('plane').classList.contains('double');
        const room = CUSTOM_SCENE ? 220 : narrow ? 230 : double ? (READINGS.lower.left - READINGS.chargers[0]) / 2 - 40 : single ? art.at[0] - READINGS.chargers[0] - 8 : 420;
        const el = this._id('dcLifetime');
        el.classList.remove('stack');
        el.style.whiteSpace = 'nowrap';
        const range = document.createRange();
        range.selectNodeContents(el);
        const width = range.getBoundingClientRect().width;
        el.style.whiteSpace = '';
        el.classList.toggle('stack', width > room * scale);
    }
    // With one charger its readings are level with the charger on the garage wall; otherwise they are
    // centred vertically.
    // With the double garage, they stand side by side on the driveway instead, each under its car (AC left, DC right),
    // in line with SigenStor and GRID.
    _alignChargers(narrow) {
        const chargers = this._id('chargers'), ac = this._id('acNode'), dc = this._id('dcNode');
        if (CUSTOM_SCENE) {
            Object.assign(chargers.style, { top: `${CHARGER_Y / SCENE.height * 100}%`, transform: '', minHeight: '0' });
            chargers.style.left = `${READINGS.chargers[narrow ? 1 : 0] / SCENE.width * 100}%`;
            return;
        }
        if (ac.hidden === dc.hidden || this._id('plane').classList.contains('double')) {
            Object.assign(chargers.style, { top: '', transform: '', minHeight: '' });
            return;
        }
        const art = ARTWORK['charger_day.png'];
        Object.assign(chargers.style, { top: `${(PHOTO.top + art.at[1] + art.size[1] / 2) / SCENE.height * 100}%`, transform: '', minHeight: '0' });
        if (narrow) chargers.style.left = `${(art.at[0] + art.size[0] + 14) / SCENE.width * 100}%`;
    }
    // The scene is shown at its preferred scale with the sides cropped; once the visible width reaches
    // the protected range, the whole scene scales down instead, so the house always stays in view.
    // Beside a taller sidebar, it scales up to fill the row as far as the protected range allows.
    _fitScene() {
        const scene = this._id('scene'), plane = this._id('plane'), sidebar = this.root.querySelector('.sidebar');
        const width = scene.clientWidth;
        if (!width) return;
        const narrow = width < SCENE.narrowBelow && matchMedia('(orientation: portrait)').matches;
        const [keepLeft, keepRight] = narrow ? SCENE.keepNarrow : SCENE.keep, keepWidth = keepRight - keepLeft;
        let scale = width / Math.min(SCENE.width, Math.max(keepWidth, width / SCENE.scale));
        let height = SCENE.height * scale;
        if (sidebar && sidebar.offsetTop === scene.offsetTop && sidebar.lastElementChild) {
            // The sidebar's own height: stretched to fill the row, it would keep the scene from ever shrinking.
            sidebar.classList.remove('fill');
            const sidebarHeight = sidebar.lastElementChild.offsetTop + sidebar.lastElementChild.offsetHeight - sidebar.firstElementChild.offsetTop;
            sidebar.classList.add('fill');
            if (sidebarHeight > height) {
                scale = Math.max(scale, Math.min(sidebarHeight / SCENE.height, width / keepWidth));
                height = sidebarHeight;
            }
        }
        const visible = width / scale;
        const centre = Math.min(SCENE.width - visible / 2, Math.max(visible / 2, (keepLeft + keepRight) / 2));
        scene.style.height = `${height}px`;
        Object.assign(plane.style, { width: `${SCENE.width * scale}px`, height: `${SCENE.height * scale}px`, left: `${-(centre - visible / 2) * scale}px`, top: `${(height - SCENE.height * scale) / 2}px` });
        // The weather stays in the top left corner of the visible sky: the photo's top edge (bleed included), or the
        // scene's when the photo is cropped, wherever the plane is cropped or centred.
        const inset = Math.max(10, 24 * scale), planeTop = (height - SCENE.height * scale) / 2;
        Object.assign(this._id('weather').style, { left: `${(centre - visible / 2) * scale + inset}px`, top: `${Math.max(0, planeTop - PHOTO.bleed * scale) - planeTop + inset}px` });
        plane.style.setProperty('--s', scale);
        plane.classList.toggle('compact', scale < .6);
        plane.classList.toggle('narrow', narrow);
        // The double garage needs the scene to show its new bay at this size: otherwise the single garage, as without it.
        const fits = !narrow && centre - visible / 2 <= DOUBLE_GARAGE.at[0];
        if (fits !== this._doubleFits) {
            this._doubleFits = fits;
            this._showCars();
        }
        const chargers = this._id('chargers');
        chargers.style.left = `${(READINGS.chargers[narrow ? 1 : 0] / SCENE.width * 100).toFixed(3)}%`;
        this._stackLifetime(narrow, scale);
        this._alignChargers(narrow);
        // When the scene is taller than the photo, the SigenStor and GRID row starts at [lower.start], as long
        // as it keeps clear of the scene's bottom edge.
        const lower = this.root.querySelector('.lower'), planeHeight = SCENE.height * scale, spare = (height - planeHeight) / 2;
        const drop = narrow || spare <= 0 ? 0 : Math.max(0, Math.min(READINGS.lower.start * scale - lower.offsetTop, planeHeight + spare - 12 - lower.offsetTop - lower.offsetHeight));
        lower.style.transform = drop ? `translateY(${drop}px)` : '';
        if (plane.classList.contains('double')) chargers.style.transform = lower.style.transform;
        for (const leader of this.root.querySelectorAll('.lowerLeader'))
            leader.setAttribute('d', leader.dataset.d.replace(/V([\d.]+)/, (_, end) => `V${+end + drop / scale}`));
    }
    // Home Assistant's time zone, or the browser's when it is missing or unknown to the browser.
    get _zone() {
        const zone = this._hass?.config?.time_zone;
        if (zone !== this._zoneName) {
            this._zoneName = zone;
            try {
                this._zoneValid = zone ? (new Intl.DateTimeFormat('en-US', { timeZone: zone }), zone) : undefined;
            } catch (e) {
                this._zoneValid = undefined;
            }
        }
        return this._zoneValid;
    }
    // Day between today's sunrise and sunset (as shown under the chart), or as sun.sun reports without a location.
    _isDay() {
        const { style } = this.config;
        if (style === 'day' || style === 'night') return style === 'day';
        if (this._sunTimes) {
            const now = Date.now();
            return now >= this._sunTimes.rise && now < this._sunTimes.set;
        }
        const sun = this._hass?.states['sun.sun']?.state;
        return sun ? sun === 'above_horizon' : true;
    }
    // The light or dark colours: [theme] forces one, else they follow Home Assistant's dark mode, or the artwork when
    // Home Assistant doesn't report one.
    _isLight() {
        const { theme } = this.config, dark = this._hass?.themes?.darkMode;
        if (theme === 'light' || theme === 'dark') return theme === 'light';
        return typeof dark === 'boolean' ? !dark : this._isDay();
    }
    // The cars in the garage: [_carWanted] (from _update) says which are there. With the double garage and room for it
    // (_fitScene), each has its bay; otherwise the single bay shows the first car there. A car with an image of its own
    // is drawn over the empty garage; without one, the existing bay shows the photo's car, the new bay a copy of it. A
    // weather photo ([_scene]) has its own double garage and copy of its car.
    _showCars() {
        if (CUSTOM_SCENE) {
            for (const id of ['garageArt', 'doubleArt', 'carArt', 'carArt2', 'chargerArt', 'chargerArt2', 'ledArt', 'ledArt2'])
                this._id(id)?.setAttribute('display', 'none');
            this._id('plane')?.classList.remove('double');
            return;
        }
        const wanted = this._carWanted;
        if (!wanted || !this._id('carArt')) return;
        const day = this._isDay(), time = day ? 'day' : 'night', ok = href => href && !this._failed.has(href);
        const scene = this._scene, garage = !this._doubleGarage ? null : scene ? `${WEATHER_URL}${scene}-double.avif` : `${GARAGE_URL}double-${time}.avif`;
        // Only fetched once it fits, so a phone, which always shows the single garage, never loads it.
        const double = this._doubleFits && ok(garage) && this._loaded.has(garage);
        // The double garage has the DC charger's car in the existing bay and the AC charger's in the new one.
        const right = double ? (wanted[1] ? 1 : null) : wanted[0] ? 0 : wanted[1] ? 1 : null;
        const left = double && wanted[0] ? 0 : null;
        const draw = (id, href, shown) => {
            const art = this._id(id);
            if (href && art.getAttribute('href') !== href) art.setAttribute('href', href);
            art.setAttribute('display', shown ? 'inline' : 'none');
        };
        draw('doubleArt', this._doubleFits ? garage : null, double);
        const own = right === null ? null : this._carHref(right, day);
        draw('carArt', own, right !== null && ok(own));
        this._id('garageArt').setAttribute('display', right !== null && !ok(own) ? 'none' : 'inline');
        let second = left === null ? null : this._carHref(left, day);
        if (left !== null && !ok(second)) second = [scene && `${WEATHER_URL}${scene}-car.avif`, `${GARAGE_URL}car-${time}.avif`].find(ok);
        draw('carArt2', second, left !== null && ok(second));
        // The wallbox on the garage wall: with the double garage, the existing bay's is the DC charger's and the new bay's
        // the AC charger's. Its cable runs to the bay's car while that car is plugged in.
        const { ac, dc } = this._chargers ?? {}, plugged = this._plugged ?? [];
        this._chargerArt('chargerArt', right !== null && plugged[right], time);
        this._chargerArt('chargerArt2', left !== null && plugged[left], time);
        this._id('chargerArt').setAttribute('display', double ? (dc ? 'inline' : 'none') : ac || dc ? 'inline' : 'none');
        this._id('chargerArt2').setAttribute('display', double && ac ? 'inline' : 'none');
        const now = this._chargingNow ?? [];
        this._ledArt('ledArt', this._id('chargerArt').getAttribute('display') === 'inline' && right !== null && plugged[right] && now[right], time);
        this._ledArt('ledArt2', this._id('chargerArt2').getAttribute('display') === 'inline' && left !== null && plugged[left] && now[left], time);
        // The charger readings move with it: the scene is laid out again.
        if (this._id('plane').classList.contains('double') !== double) {
            this._id('plane').classList.toggle('double', double);
            this._fitScene();
        }
    }
    // A wallbox's overlay for the time of day, with its cable hanging or plugged into the car.
    _chargerArt(id, plugged, time) {
        const art = ARTWORK[`charger_${time}${plugged ? '_plugged' : ''}.png`], el = this._id(id);
        if (el.getAttribute('href') === art.href) return;
        for (const [name, value] of Object.entries({ href: art.href, x: art.at[0], y: PHOTO.top + art.at[1], width: art.size[0], height: art.size[1] }))
            el.setAttribute(name, value);
    }
    // A wallbox's light glowing while its car charges.
    _ledArt(id, on, time) {
        const art = ARTWORK[`charger_${time}_led.png`], el = this._id(id);
        el.setAttribute('display', on ? 'inline' : 'none');
        if (!on || el.getAttribute('href') === art.href) return;
        for (const [name, value] of Object.entries({ href: art.href, x: art.at[0], y: PHOTO.top + art.at[1], width: art.size[0], height: art.size[1] }))
            el.setAttribute(name, value);
    }
    // tap_action, unless it is absent or does nothing.
    _tapAction() {
        const tap = this.config.tap_action;
        return tap && tap.action !== 'none' ? tap : null;
    }
    // A car's name: [key]'s value, or the state of the entity it names. A state that isn't a car's name never goes in
    // the URL; unknown or unavailable leaves the built-in car.
    _carName(key) {
        const car = this.config[key];
        if (!car?.includes('.')) return car;
        const state = this._hass?.states[car]?.state?.trim().toLowerCase();
        if (!state || ['unknown', 'unavailable'].includes(state)) return null;
        if (/^[a-z0-9-]+$/.test(state)) return state;
        this._carWarned ??= {};
        if (this._carWarned[key] !== state) console.warn(`sigenergy-flow-card: ${car} is not a car's name: ${state}`);
        this._carWarned[key] = state;
        return null;
    }
    // Car [i]'s image: its car_image, else its car's, which follows the time of day and the car's entity; the second
    // car, given neither, is the first. Null for the built-in car.
    _carHref(i, day) {
        const keys = CARS[i], image = this.config[keys.image], night = this.config[keys.night], car = this._carName(keys.car);
        if (image) return day ? image : night ?? image;
        if (car) return `${CARS_URL}${car}-${day ? 'day' : 'night'}.avif`;
        return i && !this.config[keys.car] ? this._carHref(0, day) : null;
    }
    _updateScene() {
        const day = this._isDay();
        this.toggleAttribute('day', day);
        this.toggleAttribute('light', this._isLight());
        if (!this._shown.has('scene')) return;
        const weather = this._weatherScene(day);
        if (!weather || this._loadWeather(weather)) this._scene = weather;
        const file = this._scene ?? (day ? 'house_day.png' : 'house_night.png');
        this._showCars();
        if (this._sceneFile === file) return;
        this._sceneFile = file;
        const garage = this._scene ? { ...WEATHER_GARAGE, href: `${WEATHER_URL}${this._scene}-garage.avif` } : ARTWORK[day ? 'garage_day.png' : 'garage_night.png'];
        for (const [name, value] of Object.entries({ href: garage.href, x: garage.at[0], y: PHOTO.top + garage.at[1], width: garage.size[0], height: garage.size[1] }))
            this._id('garageArt').setAttribute(name, value);
        const href = this._scene ? `${WEATHER_URL}${this._scene}.avif` : ARTWORK[file].href;
        for (const photo of this.root.querySelectorAll('.photo')) photo.setAttribute('href', href);
    }
    // The weather photo the scene shows (weather_scene), or null for the card's own.
    _weatherScene(day) {
        if (CUSTOM_SCENE || !this.config.weather_scene) return null;
        const condition = this._hass?.states[this._ent('weather')]?.state;
        return !WEATHER_SCENES.has(condition) ? null : day ? condition : `${condition}-night`;
    }
    // Whether [scene]'s photo and garage patch have loaded. Until they have, the scene keeps the photo it shows, so
    // the two change together; a scene whose images fail to load keeps it too.
    _loadWeather(scene) {
        this._weatherLoads ??= new Map();
        const state = this._weatherLoads.get(scene);
        if (state) return state === 'loaded';
        this._weatherLoads.set(scene, 'loading');
        const image = src => new Promise((resolve, reject) => Object.assign(new Image(), { onload: resolve, onerror: () => reject(src), src }));
        Promise.all([`${scene}.avif`, `${scene}-garage.avif`].map(file => image(WEATHER_URL + file))).then(() => 'loaded', src => {
            console.warn(`sigenergy-flow-card: image not found: ${src}`);
            return 'failed';
        }).then(result => {
            this._weatherLoads.set(scene, result);
            if (result === 'loaded' && this._hass) this._updateScene();
        });
        return false;
    }
    // The weather entity's condition as an icon, and its current temperature.
    _updateWeather() {
        const state = this._hass.states[this._ent('weather')];
        const condition = state && !['unknown', 'unavailable'].includes(state.state) ? state.state : null;
        const temperature = Number.parseFloat(state?.attributes?.temperature);
        const unit = state?.attributes?.temperature_unit ?? this._hass.config?.unit_system?.temperature ?? '';
        const icon = weatherIcon(condition, this._isDay());
        this._id('weather').hidden = !icon && !Number.isFinite(temperature);
        this._text('weatherTemp', Number.isFinite(temperature) ? `${Math.round(temperature)}\u00A0${unit}`.trim() : '');
        if (this._weatherKey === icon) return;
        this._weatherKey = icon;
        this._id('weatherIcon').innerHTML = icon;
    }
    _id(id) {
        return this.root.getElementById(id)
    }
    _moreInfo(entityId) {
        if (!entityId) return;
        this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId } }));
    }
    _has(id) {
        return !!id && !!this._hass?.states[id];
    }
    // Entity for an `entities:` key: the configured one, else the first available default; null when disabled or for
    // the battery's keys without a battery.
    _ent(key) {
        if (!this.config.battery_present && BATTERY_KEYS.has(key)) return null;
        const set = this.config.entities?.[key];
        if (set === false || set === null) return null;
        if (set) return set;
        if (key === 'solar_forecast_today' && this._forecastToday()) return this._forecastToday();
        const ids = this._backend.entities[key];
        return ids.find(id => !['unknown', 'unavailable', undefined].includes(this._hass?.states[id]?.state)) ?? ids[0] ?? null;
    }
    _num(id) {
        const s = id ? this._hass?.states[id]?.state : undefined;
        return s === undefined || s === null || s === '' || ['unknown', 'unavailable', 'none'].includes(String(s).toLowerCase()) ? null : (Number.isFinite(Number(s)) ? Number(s) : null)
    }
    // Rewriting unchanged text under the pointer between press and release cancels the click.
    _text(id, v) {
        this._setText(this._id(id), v);
    }
    // Status parts sit on one line, or one per line when the scene is small.
    _parts(id, parts) {
        const el = this._id(id), list = parts.filter(Boolean);
        if (el.dataset.parts === list.join('\n')) return;
        el.dataset.parts = list.join('\n');
        el.replaceChildren(...list.map(text => Object.assign(document.createElement('span'), { textContent: text })));
    }
    _setText(el, v) {
        if (el.textContent !== String(v)) el.textContent = v;
    }
    // Value in kW or kWh when the entity reports W, Wh, MW or MWh.
    _scaled(id) {
        const v = this._num(id);
        return v === null ? null : v * this._factor(id);
    }
    _factor(id) {
        return { W: .001, Wh: .001, MW: 1000, MWh: 1000 }[this._hass?.states[id]?.attributes?.unit_of_measurement] ?? 1;
    }
    // The battery's remaining time at the current power, as "1h10m to 20%": while charging, to its charge
    // cut-off SOC; while discharging, to its Backup SOC on grid (where it stops then) and to its discharge cut-off SOC off
    // grid (battery_remaining_target: auto), or always to one of them. While idle, it is how long the battery would run
    // the home in a power cut, down to its discharge cut-off SOC (its Backup SOC with backup_soc): the home's consumption
    // plus the base load learnt by _learnOverhead, and nothing until it has been learnt. Empty when unknown, at the limit
    // or 100 hours or more. Without the cut-off
    // entities, it counts to 100% and 0%; without the backup one, to the discharge cut-off.
    _batteryRemaining(bat, soc, home) {
        const cap = this._scaled(this._ent('battery_capacity'));
        if (bat === null || soc === null || cap === null) return '';
        const idle = Math.abs(bat) <= .025, overhead = this._overhead();
        if (idle && overhead.samples < 10) return '';
        const charging = bat > .025, power = idle ? (home === null ? 0 : home + overhead.kw) : Math.abs(bat);
        if (power <= .025) return '';
        const level = key => this._num(this._ent(key)), mode = this.config.battery_remaining_target;
        const offGrid = /^off[ _]?grid/i.test(this._hass.states[this._ent('grid_status')]?.state ?? '');
        const cutOff = level('battery_discharge_cut_off_soc') ?? 0, backup = level('battery_backup_soc');
        const reserve = backup !== null && backup > cutOff && (mode === 'backup_soc' || (mode === 'auto' && !idle && !offGrid));
        const target = charging ? level('battery_charge_cut_off_soc') ?? 100 : reserve ? backup : cutOff;
        const minutes = Math.round((charging ? target - soc : soc - target) / 100 * cap / power * 60);
        return minutes > 0 && minutes < 6000 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m to\u00A0${+target.toFixed(1)}%` : '';
    }
    // While the battery alone supplies the home (discharging, with no solar, grid or charger flow), what it supplies
    // beyond the home's consumption is the base load of the inverters and the system. A running average of it, in kW, is
    // kept in the browser, at most a sample every 30 s, for the remaining time while idle.
    _learnOverhead(pv, imp, exp, bat, ac, dc, home) {
        const now = Date.now();
        if (now - (this._overheadAt ?? 0) < 30e3 || bat === null || home === null || bat > -.1 || home < .1) return;
        if ((pv ?? 0) > .05 || Math.max(imp ?? 0, exp ?? 0) > .05 || Math.abs(ac ?? 0) > .05 || Math.abs(dc ?? 0) > .05) return;
        const kw = -bat - home;
        if (kw < 0 || kw > 1) return;
        this._overheadAt = now;
        const { kw: average, samples } = this._overhead();
        // The mean of the first 100 samples, then a slowly moving average.
        this._overheadValue = { kw: samples ? average + (kw - average) / Math.min(samples + 1, 100) : kw, samples: samples + 1 };
        try {
            localStorage.setItem(OVERHEAD_KEY, JSON.stringify(this._overheadValue));
        } catch (e) {
            // Without storage the average lasts until the page reloads.
        }
    }
    _overhead() {
        if (!this._overheadValue) {
            let stored = null;
            try {
                stored = JSON.parse(localStorage.getItem(OVERHEAD_KEY));
            } catch (e) {
                // Nothing usable stored.
            }
            this._overheadValue = stored && stored.kw >= 0 && stored.kw <= 1 && stored.samples > 0 ? stored : { kw: 0, samples: 0 };
        }
        return this._overheadValue;
    }
    // Battery power with charging positive, whatever the source's sign convention.
    _batterySign() {
        return this.config.battery_power_invert ? -1 : 1;
    }
    _pvEntity(i, key) {
        return this._pv[i][key];
    }
    // HOME is the balance of the other flows for a backend without a home entity (sigenergy2mqtt when the inverter
    // doesn't provide General Load Power), unless home_power is set: what solar, grid and battery supply less the chargers.
    _homeFromBalance() {
        return !!this._backend.homeBalance && this.config.entities?.home_power === undefined && !this._has(this._ent('home_power'));
    }
    // With home_includes_ac_charger, home_power includes the AC charger (e.g. a third-party one, which Sigenergy counts
    // as part of the home): HOME is home_power less the charger's power. The balance never includes it.
    _homeLessCharger() {
        return !!this.config.home_includes_ac_charger && !this._homeFromBalance() && this._has(this._ent('ac_charger_power'));
    }
    // Home consumption in kW.
    _homePower() {
        if (!this._homeFromBalance()) {
            const home = this._scaled(this._ent('home_power'));
            return home === null || !this._homeLessCharger() ? home : Math.max(0, home - Math.max(0, this._scaled(this._ent('ac_charger_power')) ?? 0));
        }
        const kw = key => this._scaled(this._ent(key));
        const pv = kw('pv_power'), bat = this.config.battery_present ? kw('battery_power') : 0, imp = kw('grid_import_power'), exp = kw('grid_export_power');
        if (pv === null || bat === null || (imp === null && exp === null)) return null;
        return Math.max(0, pv + (imp ?? 0) - (exp ?? 0) - bat * this._batterySign() - (kw('ac_charger_power') ?? 0) - (kw('dc_charger_power') ?? 0));
    }
    _updateHome() {
        if (!this._hass || !this._id('homeDialog')?.open) return;
        const home = this._homePower();
        const loads = this._homeLoads().map(item => {
            const entity = typeof item === 'string' ? item : item.entity;
            // The entity's own name, as Home Assistant shows it (without its device's), else the friendly name (a
            // device's main entity has no name of its own).
            const name = (typeof item === 'object' && item.name) || this._hass.entities?.[entity]?.name || this._hass.states[entity]?.attributes?.friendly_name || entity;
            const icon = (typeof item === 'object' && item.icon) || this._hass.states[entity]?.attributes?.icon || '';
            return { entity, name, icon, parent: item.parent ?? null, kw: this._scaled(entity) };
        }).sort((a, b) => (b.kw ?? -Infinity) - (a.kw ?? -Infinity));
        // A device inside another (its Upstream device) is part of that one's reading, so only the outer ones add up.
        const measured = loads.reduce((sum, l) => sum + (l.parent ? 0 : Math.max(0, l.kw ?? 0)), 0);
        const scale = Math.max(home ?? 0, measured, .001);
        const other = home === null ? null : home - measured;
        const drawing = loads.filter(l => l.kw !== null && l.kw >= .005);
        // Each device follows the one it's inside, indented; one whose outer device isn't drawing stands on its own.
        const shown = new Set(drawing.map(l => l.entity)), rows = [];
        const place = (l, depth) => {
            rows.push(this._loadRow(l, l.entity, scale, home, depth));
            for (const child of drawing) if (child.parent === l.entity) place(child, depth + 1);
        };
        for (const l of drawing) if (!shown.has(l.parent)) place(l, 0);
        if (!drawing.length) rows.push(this._loadsEmpty ??= Object.assign(document.createElement('div'), { className: 'muted', textContent: 'No listed load is drawing power' }));
        if (other !== null && other >= .005) rows.push(this._loadRow({ name: 'Other (unmeasured)', icon: '', kw: other }, null, scale, home));
        const list = this._id('homeLoads');
        if (rows.length !== list.children.length || rows.some((row, i) => row !== list.children[i])) list.replaceChildren(...rows);
        this._text('homeTotal', this._power(home));
        this._text('homeMeasured', home === null || home <= 0 ? '' : `Measured ${formatPower(measured)} · ${Math.round(Math.min(measured / home, 1) * 100)}% of home consumption`);
        this._id('homeWarn').hidden = home === null || measured <= home + Math.max(.1, home * .1);
    }
    // The loads HOME lists: home_entities, else (left out or empty) the Energy dashboard's individual devices that have a
    // power sensor. The chargers are left out: HOME doesn't include them. A device's parent is its Upstream device's
    // power sensor, when that one is listed.
    _homeLoads() {
        const list = this.config.home_entities;
        if (!Array.isArray(list)) return [];
        if (list.length) return list;
        const chargers = new Set([this._ent('ac_charger_power'), this._ent('dc_charger_power')]);
        const devices = (this._energyDevices ?? []).filter(d => typeof d.stat_rate === 'string' && !chargers.has(d.stat_rate));
        const rates = new Map(devices.map(d => [d.stat_consumption, d.stat_rate]));
        return devices.map(d => ({ entity: d.stat_rate, name: d.name, parent: rates.get(d.included_in_stat) ?? null }));
    }
    // The Energy dashboard's individual devices, for HOME when home_entities is left out. HA before 2025.12 has no
    // device power sensor, and no saved energy preferences is an error: both leave HOME a plain label.
    // The Energy dashboard's preferences: its individual devices, for HOME when home_entities is left out, and the solar
    // forecast it uses, for the Solar forecast tile.
    async _loadEnergyDevices() {
        const home = this._shown.has('scene') && this.config.home_entities?.length === 0;
        if (!home && !this._shown.has('tiles') || typeof this._hass?.callWS !== 'function') return;
        this._energyDevicesAt = Date.now();
        const forecast = this._ent('solar_forecast_today');
        try {
            const prefs = await this._hass.callWS({ type: 'energy/get_prefs' });
            this._energyDevices = prefs?.device_consumption ?? [];
            this._forecastEntries = new Set((prefs?.energy_sources ?? []).flatMap(source => source.type === 'solar' ? source.config_entry_solar_forecast ?? [] : []));
        } catch {
            this._energyDevices ??= [];
        }
        if (!this._hass) return;
        this._update();
        this._updateHome();
        // Another forecast entity: its history and the forecast are loaded again.
        if (this._shown.has('tiles') && this._ent('solar_forecast_today') !== forecast) {
            this._loadForecast();
            this._loadForecastWeek();
        }
    }
    // The today sensor of the solar forecast the Energy dashboard uses (Forecast.Solar's or Solcast's), if it has one.
    _forecastToday() {
        const entries = this._forecastEntries, registry = this._hass?.entities, devices = this._hass?.devices;
        if (!entries?.size || !registry || !devices) return null;
        // Found again only when the registry or the preferences change.
        const cache = this._forecastTodayCache;
        if (cache?.registry !== registry || cache.entries !== entries) {
            const entry = Object.values(registry).find(e => ['energy_production_today', 'total_kwh_forecast_today'].includes(e.translation_key)
                && devices[e.device_id]?.config_entries?.some(id => entries.has(id)));
            this._forecastTodayCache = { registry, entries, id: entry?.entity_id ?? null };
        }
        const id = this._forecastTodayCache.id;
        return id && this._has(id) ? id : null;
    }
    // Rows are kept per entity and updated in place, so a click is not lost to a refresh.
    _loadRow(load, entity, scale, home, depth = 0) {
        const key = entity ?? '';
        let row = this._loadRows.get(key);
        if (!row) {
            row = document.createElement('button');
            row.className = entity ? 'load' : 'load other';
            if (entity) Object.assign(row.dataset, { entity }), row.title = entity;
            else row.tabIndex = -1;
            row.innerHTML = '<span class="name"><span></span></span><span></span><span class="pct"></span><span class="bar"><i></i></span>';
            this._loadRows.set(key, row);
        }
        row.style.marginLeft = depth ? `${depth * 18}px` : '';
        const [name, value, pct, bar] = row.children;
        let icon = name.querySelector('ha-icon');
        if (load.icon && !icon) name.prepend(icon = document.createElement('ha-icon'));
        if (icon && icon.getAttribute('icon') !== load.icon) load.icon ? icon.setAttribute('icon', load.icon) : icon.remove();
        this._setText(name.lastElementChild, load.name);
        this._setText(value, formatPower(load.kw));
        this._setText(pct, home === null || home <= 0 ? '' : `${Math.round(Math.max(0, load.kw) / home * 100)}%`);
        bar.firstChild.style.width = `${(Math.max(0, load.kw) / scale * 100).toFixed(1)}%`;
        return row;
    }
    // A string is fitted when at least one of its entities exists in Home Assistant.
    _pvFitted(i) {
        return PV_KEYS.some(key => this._has(this._pv[i][key]));
    }
    _updatePv() {
        if (!this._hass || !this._id('pvDialog')?.open) return;
        const digits = { voltage: 1, current: 2, power: 2, daily_energy: 2, accumulated_energy: 2 };
        const sums = { power: null, daily_energy: null, accumulated_energy: null };
        this._pv.forEach((_, i) => {
            const fitted = this._pvFitted(i);
            this._id(`pvRow${i}`).hidden = !fitted;
            this._id(`pvLegend${i}`).hidden = !fitted;
            if (!fitted) return;
            for (const key of Object.keys(digits)) {
                const id = this._pvEntity(i, key);
                const v = key === 'voltage' || key === 'current' ? this._num(id) : this._scaled(id);
                this._text(`pv${i}_${key}`, v === null ? '—' : v.toFixed(digits[key]));
                if (key in sums && v !== null) sums[key] = (sums[key] ?? 0) + v;
            }
        });
        // Total row: the solar totals the main card shows, else the system's own PV sensors or the sum of the strings
        // above, plus the third-party PV row. The Sigenergy sensors leave out the third-party inverter; without them the
        // Total is unknown rather than the third-party PV alone.
        const kw = key => this._scaled(this._ent(key));
        const third = { power: kw('third_party_pv_power'), daily_energy: kw('third_party_pv_daily_energy'), accumulated_energy: kw('third_party_pv_lifetime_energy') };
        const totals = {
            power: kw('pv_power'),
            daily_energy: this._pvTotal('daily_pv_energy', 'third_party_pv_daily_energy'),
            accumulated_energy: this._pvTotal('stat_pv', 'third_party_pv_lifetime_energy'),
        };
        const own = {
            power: kw('pv_strings_power') ?? sums.power,
            daily_energy: sums.daily_energy,
            accumulated_energy: kw('pv_strings_lifetime_energy') ?? sums.accumulated_energy,
        };
        for (const [key, v] of Object.entries(own)) {
            const total = totals[key] ?? (v === null ? null : v + (third[key] ?? 0));
            this._text(`pvTotal_${key}`, total === null ? '—' : total.toFixed(2));
            this._text(`pvThird_${key}`, third[key] === null ? '—' : third[key].toFixed(2));
        }
        // The integrations count the strings' lifetime energy themselves, from their power, and can miss production the
        // inverter's own counter has; say so when the strings don't add up to the Total.
        const strings = sums.accumulated_energy === null ? null : sums.accumulated_energy + (third.accumulated_energy ?? 0);
        const ratio = strings === null || !(totals.accumulated_energy > 0) ? 1 : strings / totals.accumulated_energy;
        this._id('pvLifetimeNote').hidden = ratio >= .95 && ratio <= 1.05;
        const fitted = this._hasThirdPartyPv();
        this._id('pvThirdRow').hidden = !fitted;
        this._id('pvLegendThird').hidden = !fitted || !this._has(this._ent('third_party_pv_power'));
    }
    // A third-party inverter is fitted when its sensors have recorded any energy or power: the integrations create some
    // of them, reading 0, on systems without one.
    _hasThirdPartyPv() {
        return ['third_party_pv_lifetime_energy', 'third_party_pv_daily_energy', 'third_party_pv_power'].some(key => (this._scaled(this._ent(key)) ?? 0) > .005);
    }
    // The entities whose sum is the solar total of [key]: its entity, plus the third-party inverter's [thirdKey] when
    // [key] is left at a default that leaves that inverter out and one is fitted. An entity set in the config is the
    // total as it is. For [statistics], a missing third-party lifetime counter (Sigenergy Local Modbus creates it
    // disabled) gives way to the third-party daily sensor, whose statistics give the same energy per period.
    _pvSources(key, thirdKey, statistics = false) {
        const id = this._ent(key);
        if (!id) return [];
        if (this.config.entities?.[key] !== undefined || !SIGEN_ONLY_PV.has(id) || !this._hasThirdPartyPv()) return [id];
        let third = this._ent(thirdKey);
        if (statistics && !(third && this._has(third)) && thirdKey === 'third_party_pv_lifetime_energy' && this.config.entities?.[thirdKey] === undefined)
            third = this._ent('third_party_pv_daily_energy');
        return third && this._has(third) ? [id, third] : [id];
    }
    // The solar total of [key], in kW or kWh; null without its own entity's value.
    _pvTotal(key, thirdKey) {
        const [own, ...rest] = this._pvSources(key, thirdKey).map(id => this._scaled(id));
        return own === null || own === undefined ? null : rest.reduce((sum, v) => sum + (v ?? 0), own);
    }
    // The phases: grid_phases when set, else the last phase whose voltage or grid power isn't 0 (a single-phase system
    // can have phase B and C entities that read 0), else 1 when phase A has an entity; 0 is none.
    _gridPhases() {
        const set = Number(this.config.grid_phases);
        if ([1, 2, 3].includes(set)) return set;
        const live = phase => (this._num(this._ent(`grid_phase_${phase}_voltage`)) ?? 0) > 0 || Math.abs(this._num(this._ent(`grid_phase_${phase}_active_power`)) ?? 0) > 0;
        const last = GRID_PHASES.map(live).lastIndexOf(true);
        if (last >= 0) return last + 1;
        return ['voltage', 'current', 'active_power'].some(kind => this._has(this._ent(`grid_phase_a_${kind}`))) ? 1 : 0;
    }
    // Beside GRID: the grid_voltage entity, else the phases' average voltage, as "(231V)"; it wraps below GRID in the
    // narrow layout.
    _gridLabel(phases) {
        const set = this._ent('grid_voltage');
        const ids = set ? [set] : GRID_PHASES.slice(0, phases).map(phase => this._ent(`grid_phase_${phase}_voltage`));
        const values = ids.map(id => this._num(id)).filter(v => v !== null);
        if (!values.length) return '';
        const unit = this._hass.states[ids[0]]?.attributes?.unit_of_measurement ?? (set ? '' : 'V');
        return `(${Math.round(values.reduce((a, b) => a + b, 0) / values.length)}${unit})`;
    }
    // The entities a Grid dialog reading comes from: power is voltage × current.
    _gridIds(phase, kind) {
        if (kind === 'power_factor') return [this._ent('grid_power_factor')];
        return (kind === 'power' ? ['voltage', 'current'] : [kind]).map(k => this._ent(`grid_phase_${phase}_${k}`));
    }
    _gridValue(phase, kind) {
        if (kind === 'active_power') return this._scaled(this._ent(`grid_phase_${phase}_active_power`));
        const [first, second] = this._gridIds(phase, kind).map(id => this._num(id));
        return kind !== 'power' ? first : first === null || second === null ? null : first * second / 1000;
    }
    _gridAvailable(phase, kind) {
        return this._gridIds(phase, kind).every(id => this._has(id));
    }
    _updateGrid() {
        if (!this._hass || !this._id('gridDialog')?.open) return;
        const phases = Math.max(1, this._gridPhases()), pick = this._gridPick;
        // A column shows when any phase has its entities.
        const shown = Object.fromEntries(GRID_KINDS.map(kind => [kind, GRID_PHASES.slice(0, phases).some(phase => this._gridAvailable(phase, kind))]));
        for (const kind of GRID_KINDS)
            for (const el of this._id('gridDialog').querySelectorAll(`[data-column="${kind}"]`)) el.hidden = !shown[kind];
        const inverter = shown.voltage || shown.current || shown.power || this._has(this._ent('grid_power_factor'));
        this._id('gridNoteInverter').hidden = !inverter;
        this._id('gridNoteGrid').hidden = !shown.active_power;
        this._id('gridNote').hidden = !inverter && !shown.active_power;
        GRID_PHASES.forEach((phase, i) => {
            this._id(`gridRow_${phase}`).hidden = i >= phases;
            for (const kind of GRID_KINDS) {
                const cell = this._id(`grid_${phase}_${kind}`), v = this._gridValue(phase, kind);
                this._setText(cell, v === null ? '—' : v.toFixed(kind === 'voltage' ? 1 : 2));
                cell.disabled = !this._gridAvailable(phase, kind);
                cell.setAttribute('aria-pressed', pick.phase === phase && pick.kind === kind);
            }
        });
        const pfId = this._ent('grid_power_factor'), pf = this._num(pfId), button = this._id('gridPf');
        button.hidden = !this._has(pfId);
        button.setAttribute('aria-pressed', pick.kind === 'power_factor');
        this._text('gridPfValue', pf === null ? '—' : pf.toFixed(2));
    }
    // The last 24 hours of the chosen reading; power is voltage × current at each time either changed.
    // Without the chosen reading's entities, the first available reading is charted.
    async _loadGridHistory() {
        if (!this._hass) return;
        const available = ({ phase, kind }) => kind === 'power_factor' ? this._has(this._ent('grid_power_factor')) : this._gridAvailable(phase, kind);
        if (!available(this._gridPick)) {
            const first = GRID_PHASES.flatMap(phase => GRID_KINDS.map(kind => ({ phase, kind }))).find(available);
            if (first) {
                this._gridPick = first;
                this._updateGrid();
            }
        }
        const { phase, kind } = this._gridPick, ids = this._gridIds(phase, kind), unit = GRID_UNITS[kind];
        const name = kind === 'power_factor' ? 'Inverter power factor' : `Phase ${phase.toUpperCase()} ${GRID_HEADS[kind].join(' ').toLowerCase()}`;
        this._text('gridChartTitle', `${name}${unit ? ` (${unit})` : ''}`);
        if (!ids.every(id => this._has(id))) {
            this._id('gridChart').replaceChildren();
            this._text('gridChartStatus', 'Not available');
            return;
        }
        await this._dialogChart('gridChart', 'gridChartStatus', 'No recorded history in the last 24 hours', ids, ([first, second]) => {
            if (kind === 'active_power') {
                const factor = this._factor(ids[0]);
                return [{ points: first.map(p => ({ t: p.t, v: p.v * factor })), color: 'var(--c-grid)', name, unit, digits: 2, note: v => v > .005 ? 'import' : v < -.005 ? 'export' : '' }];
            }
            const points = kind !== 'power' ? first : [...new Set([...first, ...second].map(p => p.t))].sort((a, b) => a - b)
                .map(t => ({ t, volts: this._valueAt(first, t), amps: this._valueAt(second, t) }))
                .filter(p => p.volts !== null && p.amps !== null).map(p => ({ t: p.t, v: p.volts * p.amps / 1000 }));
            return [{ points, color: 'var(--c-grid)', name, unit, digits: kind === 'voltage' || kind === 'current' ? 1 : 2 }];
        }, undefined, { hours: 24, fit: kind === 'voltage' || kind === 'current' || kind === 'power_factor', signed: kind === 'active_power' });
    }
    // Stored energy is SOC × rated capacity; no sensor reports it directly.
    _updateEnergy() {
        if (!this._hass || !this._id('energyDialog')?.open) return;
        const soc = this._num(this._socEntity), cap = this._scaled(this._ent('battery_capacity'));
        this._text('energyNow', soc === null || cap === null ? '—' : `${(soc * cap / 100).toFixed(1)} kWh`);
        this._text('energyOf', cap === null ? '' : `of ${cap.toFixed(1)} kWh rated capacity${soc === null ? '' : ` · ${soc.toFixed(1)}%`}`);
    }
    async _loadEnergyHistory() {
        if (!this._hass) return;
        const cap = this._scaled(this._ent('battery_capacity'));
        if (cap === null) {
            this._text('energyChartStatus', 'Rated capacity unavailable');
            return;
        }
        if (!this._socEntity) {
            this._text('energyChartStatus', 'Battery SOC not configured');
            return;
        }
        await this._dialogChart('energyChart', 'energyChartStatus', 'No recorded battery history today', [this._socEntity],
            ([points]) => [{ points: points.map(p => ({ t: p.t, v: p.v * cap / 100 })), color: 'var(--c-battery)', name: 'Stored', unit: 'kWh' }], Math.ceil(cap / 2) * 2);
    }
    // Today's solar forecast, the latest; today's production so far against the forecast up to now, the current hour
    // counted pro rata; and the last 7 days' production against their forecasts. Without the forecast entity, the total
    // is Home Assistant's solar forecast's, else the average production of the last 7 days, without the ratios; with the
    // entity disabled, there is no tile. Without any of them, Solar produced takes both columns.
    // The forecast up to now adds up each past hour's forecast as recorded during that hour by the forecast's sensor
    // for the current hour, since Home Assistant's solar forecast drops an hour once it has passed; without that
    // sensor, it is Home Assistant's solar forecast for the hours it still has.
    _updateForecastTile() {
        const id = this._ent('solar_forecast_today'), hours = this._solarHours, recorded = this._forecastRecorded, now = Date.now();
        if (recorded) {
            // While the card is open, the sensor's live state extends its recorded history.
            const live = this._num(recorded.id), points = recorded.points;
            if (live !== null && live !== points[points.length - 1].v) points.push({ t: now, v: live });
        }
        const tile = this._id('forecastStat'), view = this._view();
        if (!tile) return;
        // A past day: its forecast and its production against it; the dialog charts today only. Longer ranges have none.
        tile.disabled = !view.live;
        if (!view.live) {
            const tiles = this._tiles?.key === view.key ? this._tiles : null;
            const actual = tiles?.values?.get('dayPv') ?? null, forecast = view.range === 'Day' ? tiles?.forecast ?? null : null;
            tile.hidden = forecast === null;
            this._id('dayPv').closest('.stat').classList.toggle('wide', tile.hidden);
            if (tile.hidden) return;
            this._text('dayForecast', this._energy(forecast));
            this._parts('forecastPerf', [actual !== null && forecast >= .1 ? `(Perf: ${Math.round(actual / forecast * 100)}%)` : '']);
            return;
        }
        // Until the forecast entity has updated since midnight, it is yesterday's: today's hours of Home Assistant's solar
        // forecast stand in, else —.
        const stale = this._stale(id);
        let total = this._today(id);
        const expected = id ? this._forecastSoFar(now) : null;
        if (id && hours) total ??= [...hours.values()].reduce((a, b) => a + b, 0);
        const average = id && total === null && !stale ? this._pvWeekAverage ?? null : null;
        total ??= average;
        tile.hidden = total === null && !stale;
        this._id('dayPv').closest('.stat').classList.toggle('wide', tile.hidden);
        if (tile.hidden) return;
        this._text('dayForecast', total === null ? '—' : this._energy(total));
        // Before .1 kWh of forecast, today's ratio means little.
        const actual = this._pvTotal('daily_pv_energy', 'third_party_pv_daily_energy'), week = this._forecastWeek;
        const ratio = (a, f) => `${Math.round(a / f * 100)}%`;
        this._parts('forecastPerf', average !== null ? ['(7-day average)']
            : [actual !== null && expected >= .1 ? `(Perf today: ${ratio(actual, expected)})` : '', week ? `(Perf 7 days: ${ratio(week.actual, week.forecast)})` : '']);
        this._updateForecastDialog();
    }
    // Today's forecast up to [now], in kWh: Home Assistant's solar forecast up to now while it has no gap; else the day's
    // forecast less its remaining-today sensor, so that by the evening it is the day's forecast, as a past day shows it,
    // plus the hourly forecast for the time since that sensor last changed, pro rata. Without that sensor, the forecast
    // recorded hour by hour.
    _forecastSoFar(now) {
        const slots = this._slotsUpTo(now);
        if (slots !== null) return slots;
        const remainingId = this._forecastEntity('energy_production_today_remaining', 'forecast_remaining_today');
        const total = this._today(this._ent('solar_forecast_today')), remaining = remainingId ? this._today(remainingId) : null;
        if (total === null || remaining === null) return this._forecastUpTo(now);
        const since = Date.parse(this._hass.states[remainingId].last_updated);
        let sum = Math.max(0, total - remaining);
        for (const [hour, kwh] of Number.isFinite(since) ? this._solarHours ?? [] : [])
            sum += kwh * Math.max(0, Math.min(now, hour + 3600e3) - Math.max(since, hour)) / 3600e3;
        return sum;
    }
    // A forecast sensor not updated since midnight still holds yesterday's forecast (Forecast.Solar updates hourly from
    // its last fetch, not at midnight).
    _stale(id) {
        return Date.parse(this._hass?.states[id]?.last_updated) < zoneMidnight(Date.now(), this._zone).getTime();
    }
    // A forecast sensor's reading for today, in kWh: null while it is yesterday's.
    _today(id) {
        return this._stale(id) ? null : this._scaled(id);
    }
    // Home Assistant's solar forecast from today's midnight up to [t], in kWh, each entry (half an hour for Solcast, an
    // hour for Forecast.Solar) lasting until the next and the one at [t] counted pro rata; null without one, or with an
    // entry missing before [t] (an interval longer than the usual one).
    _slotsUpTo(t) {
        const slots = this._solarSlots?.filter(([start]) => start < t);
        if (!slots?.length) return null;
        const counts = new Map();
        for (let i = 1; i < this._solarSlots.length; i++) {
            const gap = this._solarSlots[i][0] - this._solarSlots[i - 1][0];
            counts.set(gap, (counts.get(gap) ?? 0) + 1);
        }
        const step = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 3600e3;
        let sum = 0;
        for (let i = 0; i < slots.length; i++) {
            const [start, kwh] = slots[i];
            let length = (this._solarSlots[i + 1]?.[0] ?? start + step) - start;
            if (length > step * 1.5) {
                if (t > start + step) return null;
                length = step;
            }
            sum += kwh * Math.min(1, (t - start) / length);
        }
        return sum;
    }
    // The forecast's production from today's midnight up to [t] (now or earlier), in kWh: Home Assistant's solar forecast
    // while it has no gap; else, the hour at [t] counted pro rata, each hour's forecast as the forecast's sensor for the
    // current hour recorded it up to [t], else Home Assistant's solar forecast for the hours it still has; null without
    // either.
    _forecastUpTo(t) {
        const slots = this._slotsUpTo(t);
        if (slots !== null) return slots;
        const recorded = this._forecastRecorded, hours = this._solarHours;
        let sum = 0;
        if (recorded) {
            const { points, factor } = recorded;
            const at = time => {
                let v = null;
                for (const p of points) if (p.t <= time) v = p.v; else break;
                return v ?? 0;
            };
            for (let hour = zoneMidnight(t, this._zone).getTime(); hour < t; hour += 3600e3)
                sum += at(Math.min(hour + 3600e3, t) - 1) * factor * Math.min(1, (t - hour) / 3600e3);
            return sum;
        }
        if (!hours) return null;
        for (const [hour, kwh] of hours) sum += kwh * Math.min(1, Math.max(0, (t - hour) / 3600e3));
        return sum;
    }
    // Solar performance dialog: today's performance, as the Solar forecast tile shows it, and its figures.
    _updateForecastDialog() {
        if (!this._hass || !this._id('forecastDialog')?.open) return;
        const id = this._ent('solar_forecast_today'), now = Date.now();
        const actual = this._pvTotal('daily_pv_energy', 'third_party_pv_daily_energy'), expected = id ? this._forecastSoFar(now) : null;
        const total = this._today(id) ?? (this._solarHours ? [...this._solarHours.values()].reduce((a, b) => a + b, 0) : null);
        this._text('forecastPerfNow', actual !== null && expected >= .1 ? `${Math.round(actual / expected * 100)}%` : '—');
        this._text('forecastSummary', [actual === null ? '' : `${this._kwh(actual)} produced`, expected === null ? '' : `${this._kwh(expected)} forecast up to now`,
            total === null ? '' : `${this._kwh(total)} forecast today`].filter(Boolean).join(' · '));
        this._id('forecastEntity').hidden = !this._has(id);
    }
    // Today's solar produced and the forecast up to each moment, both cumulative, the forecast continuing dashed to the
    // end of the day from Home Assistant's solar forecast; the tip adds the performance against that forecast.
    async _loadForecastChart() {
        if (!this._hass) return;
        const ids = this._pvSources('daily_pv_energy', 'third_party_pv_daily_energy').filter(id => this._has(id));
        if (!ids.length || !this._ent('solar_forecast_today')) {
            this._text('forecastChartStatus', 'Solar forecast not configured');
            return;
        }
        await this._dialogChart('forecastChart', 'forecastChartStatus', 'No recorded solar history today', ids, sources => {
            const now = Date.now(), midnight = zoneMidnight(now, this._zone).getTime();
            // A daily counter can reset some time after midnight: what it read before its last drop is yesterday's.
            const counters = sources.map((points, i) => {
                const factor = this._factor(ids[i]);
                const reset = points.reduce((last, p, j) => j && p.v < points[j - 1].v ? j : last, 0);
                return points.slice(reset).map(p => ({ t: p.t, v: p.v * factor }));
            });
            const times = [...new Set(counters.flat().map(p => p.t))].sort((a, b) => a - b);
            const produced = times.map(t => ({ t, v: counters.reduce((sum, points) => sum + (this._valueAt(points, t) ?? 0), 0) }));
            const hourly = [];
            for (let t = midnight; t < now; t += 3600e3) hourly.push(t);
            const forecast = [...hourly, now].map(t => ({ t, v: this._forecastUpTo(t) ?? 0 }));
            // The rest of the day: what is left of the current hour, then Home Assistant's forecast hour by hour.
            const ahead = [forecast[forecast.length - 1]], hours = this._solarHours ?? new Map();
            const current = hourly[hourly.length - 1] ?? midnight, left = (this._forecastRecorded
                ? this._scaled(this._forecastRecorded.id) ?? 0 : hours.get(current) ?? 0) * Math.max(0, (current + 3600e3 - now) / 3600e3);
            let sum = ahead[0].v + left;
            ahead.push({ t: current + 3600e3, v: sum });
            for (const [t, kwh] of [...hours].filter(([t]) => t > current).sort((a, b) => a[0] - b[0])) {
                if (t > ahead[ahead.length - 1].t) ahead.push({ t, v: sum });
                sum += kwh;
                ahead.push({ t: t + 3600e3, v: sum });
            }
            const perf = produced.map(p => ({ t: p.t, f: this._forecastUpTo(p.t) ?? 0, v: p.v })).filter(p => p.f >= .1).map(p => ({ t: p.t, v: p.v / p.f * 100 }));
            // Where the forecast stays flat between stretches where it rises, an hour is missing from it: the line
            // breaks across it rather than drawing it as no production.
            const flats = (points, rose) => {
                const up = points.map((p, i) => i > 0 && p.v - points[i - 1].v > 1e-6), last = up.lastIndexOf(true), breaks = [];
                for (let i = 1; i < last; i++) { if (up[i]) rose = true; else if (rose) breaks.push({ start: points[i - 1].t, end: points[i].t }); }
                return breaks.length ? { breaks } : {};
            };
            const rose = forecast.some((p, i) => i && p.v - forecast[i - 1].v > 1e-6);
            return [
                { points: produced, color: 'var(--c-solar)', name: 'Produced', unit: 'kWh', digits: 2 },
                { points: forecast, color: 'var(--sub)', name: 'Forecast', unit: 'kWh', digits: 2, ...flats(forecast, false) },
                { points: ahead, color: 'var(--sub)', name: 'Forecast', unit: 'kWh', digits: 2, forecast: true, ...flats(ahead, rose) },
                { points: perf, color: 'var(--c-solar)', name: 'Performance', unit: '%', digits: 0, tipOnly: true },
            ];
        });
    }
    // A sensor of the forecast on the same device as solar_forecast_today, found by any of its [keys] (translation keys,
    // e.g. Forecast.Solar's energy_production_today_remaining and Solcast's forecast_remaining_today).
    _forecastEntity(...keys) {
        const registry = this._hass?.entities, device = registry?.[this._ent('solar_forecast_today')]?.device_id;
        if (!device) return null;
        const patterns = keys.map(key => new RegExp(`${key}(_\\d+)?$`));
        const entry = Object.values(registry).find(e => e.device_id === device && (keys.includes(e.translation_key) || patterns.some(p => p.test(e.entity_id))));
        return entry && this._has(entry.entity_id) ? entry.entity_id : null;
    }
    // The previous 7 days' solar production and forecasts, today left out. A day's forecast is the last state the
    // forecast entity recorded that day, its latest; a day's production is the change of the solar lifetime counters.
    // Days missing either are left out of the ratio; the average production counts every day with production data.
    async _loadForecastWeek() {
        const request = this._forecastWeekRequest = (this._forecastWeekRequest ?? 0) + 1;
        this._forecastWeek = this._pvWeekAverage = null;
        const id = this._ent('solar_forecast_today'), pv = this._pvSources('stat_pv', 'third_party_pv_lifetime_energy', true).filter(source => this._has(source));
        if (!id || !pv.length || typeof this._hass.callWS !== 'function' || typeof this._hass.callApi !== 'function') return;
        const zone = this._zone, today = zoneMidnight(Date.now(), zone), day = zoneParts(today, zone), from = zoneDate(zone, day.y, day.m, day.d - 7);
        try {
            const [{ data }, statistics] = await Promise.all([
                this._has(id) ? this._history([id], from) : { data: [] },
                this._statistics(pv, from, today, 'day', ['change']),
            ]);
            if (request !== this._forecastWeekRequest) return;
            const forecasts = new Map(), actual = new Map(), factor = this._factor(id);
            for (const p of this._series(data, [id])[0])
                if (p.t >= from.getTime() && p.t < today.getTime()) forecasts.set(zoneMidnight(p.t, zone).getTime(), p.v * factor);
            for (const source of pv)
                for (const row of statistics?.[source] ?? []) {
                    const t = zoneMidnight(typeof row.start === 'number' ? row.start : Date.parse(row.start), zone).getTime(), v = Number(row.change);
                    if (Number.isFinite(v)) actual.set(t, (actual.get(t) ?? 0) + Math.max(0, v * this._factor(source)));
                }
            const week = { actual: 0, forecast: 0 };
            for (const [t, forecast] of forecasts)
                if (actual.has(t)) { week.actual += actual.get(t); week.forecast += forecast; }
            this._forecastWeek = week.forecast > 0 ? week : null;
            this._pvWeekAverage = actual.size ? [...actual.values()].reduce((a, b) => a + b, 0) / actual.size : null;
        } catch (e) {
            if (request !== this._forecastWeekRequest) return;
        }
        this._updateForecastTile();
    }
    _updateSoc() {
        if (!this._hass || !this._id('socDialog')?.open) return;
        const soc = this._num(this._socEntity);
        this._text('socNow', soc === null ? '—' : `${soc.toFixed(1)}%`);
    }
    async _loadSocHistory() {
        if (!this._hass) return;
        if (!this._socEntity) {
            this._text('socChartStatus', 'Battery SOC not configured');
            return;
        }
        await this._dialogChart('socChart', 'socChartStatus', 'No recorded battery history today', [this._socEntity],
            ([points]) => [{ points, color: 'var(--c-battery)', name: 'SOC', unit: '%' }], 100);
    }
    async _loadPvHistory() {
        if (!this._hass) return;
        const strings = this._pv.map((pv, i) => ({ ...pv, color: PV_COLORS[i % PV_COLORS.length] })).filter(pv => this._has(pv.power));
        const third = this._ent('third_party_pv_power');
        if (this._has(third) && this._hasThirdPartyPv()) strings.push({ name: 'Third-party PV', power: third, color: 'var(--pv-third)' });
        const ids = strings.map(pv => pv.power);
        if (!ids.length) {
            this._text('pvChartStatus', 'No PV power entities configured');
            return;
        }
        await this._dialogChart('pvChart', 'pvChartStatus', 'No recorded PV history today', ids, series => series.map((points, i) => {
            const factor = this._factor(ids[i]);
            return { points: points.map(p => ({ t: p.t, v: p.v * factor })), color: strings[i].color, name: strings[i].name };
        }));
    }
    // Recorded states of [ids] from [start] (today's midnight in Home Assistant's time zone) until now.
    async _history(ids, start = zoneMidnight(Date.now(), this._zone), end = new Date()) {
        const query = `history/period/${encodeURIComponent(start.toISOString())}?filter_entity_id=${encodeURIComponent(ids.join(','))}&end_time=${encodeURIComponent(end.toISOString())}&minimal_response&no_attributes`;
        return { start: start.getTime(), data: await this._hass.callApi('GET', query) };
    }
    // A dialog's chart of today's history and its status: [toSeries] turns each id's points into the chart's series.
    // With [hours], it shows the last [hours] hours instead; [fit] fits the value axis to the data.
    // [signed] draws values either side of 0.
    async _dialogChart(chart, status, empty, ids, toSeries, top, { hours, fit, signed = false } = {}) {
        const svg = this._id(chart), request = svg._request = (svg._request ?? 0) + 1;
        this._text(status, 'Loading history…');
        try {
            const { start, data } = await this._history(ids, hours ? new Date(Date.now() - hours * 3600e3) : undefined);
            if (request !== svg._request) return;
            const hasData = this._showChart(svg, toSeries(this._series(data, ids)), start, signed, top, hours ? { end: Date.now(), fit } : undefined);
            this._text(status, hasData ? hours ? `Last ${hours} hours` : 'Midnight → now' : empty);
        } catch (e) {
            if (request !== svg._request) return;
            this._text(status, 'Recorder history unavailable');
            svg.replaceChildren();
        }
    }
    _power(v) {
        return v === null ? '—' : formatPower(v)
    }
    _kwh(v) {
        return `${v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}\u00A0kWh`;
    }
    // Lifetime charged / discharged; discharged (V2G / V2H) is left out while it reads 0.
    _lifetime(charged, discharged) {
        return [charged === null ? '' : `Lifetime ↓\u00A0${this._kwh(charged)}`, discharged === null || discharged === 0 ? '' : `↑\u00A0${this._kwh(discharged)}`];
    }
    _energy(v) {
        return v === null ? '—' : `${v.toFixed(2)} kWh`
    }
    // Positive power runs from the start of the flow's path to its end.
    _flow(id, power) {
        if (!this._flowStates) this._flowStates = {};
        this._flowStates[id] = { active: power !== null && Math.abs(power) >= .025, reverse: power !== null && power < 0, kw: power === null ? 0 : Math.abs(power) };
        this._applyFlowClass(id);
    }
    _applyFlowClass(id) {
        const group = this._id(id);
        if (!group) return;
        group.classList.toggle('active', !!this._flowStates[id].active);
        group.classList.toggle('moving', !matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    connectedCallback() {
        if (!this.root) return;
        if (!this._chartObserver) this._observeCharts();
        if (!this._flowFrame) this._startFlowAnimation();
        this._statTimer ??= setInterval(() => { if (this._view().current) this._loadView(true); }, 300000);
        this._historyTimer ??= setInterval(() => {
            if (document.hidden) return;
            this._advanceChart();
            if ((this._shown.has('tiles') || this._shown.has('metrics')) && Date.now() - (this._forecastAt ?? 0) > 3600e3) this._loadForecast();
        }, 30000);
    }
    _startFlowAnimation() {
        if (this._flowFrame) cancelAnimationFrame(this._flowFrame);
        if (!this._shown.has('scene')) return;
        let previousFrame = null;
        const draw = (now) => {
            if (!this.isConnected) {
                this._flowFrame = null;
                return;
            }
            const dt = previousFrame === null ? 0 : Math.min(now - previousFrame, 100) / 1000;
            previousFrame = now;
            // The speed eases towards the home power's, and the cycle advances by distance so a change of speed
            // moves no pulse.
            const home = this._flowStates?.homeFlow, target = PULSE.speed[0] + PULSE.speed[1] * Math.sqrt(home?.active ? home.kw : 0);
            this._pulseSpeed = this._pulseSpeed === undefined ? target : this._pulseSpeed + (target - this._pulseSpeed) * Math.min(1, dt * 2);
            const { cycle } = this._pulseCycle();
            this._pulseAt = ((this._pulseAt ?? 0) + this._pulseSpeed * dt) % cycle;
            for (const item of this._flowItems) {
                const state = this._flowStates?.[item.id];
                if (!state?.active || (item.parent && !this._flowStates[item.parent.id]?.active)) continue;
                if (!item.length) {
                    item.length = item.wire.getTotalLength();
                    this._addGlowFilter(item);
                    if (item.parent) item.fork = this._forkDistance(item.parent, item);
                }
                // Centre of the pulse, measured along the direction of travel.
                const travelled = this._pulseAt - this._pulseStart(item.parent ?? item) - PULSE.length / 2 - (item.fork ?? 0);
                const centre = state.reverse ? item.length - travelled : travelled;
                const place = (el, dash) => {
                    el.setAttribute('stroke-dasharray', `${dash} ${cycle - dash}`);
                    el.setAttribute('stroke-dashoffset', `${dash / 2 - centre}`);
                };
                place(item.glow, PULSE.length * .6);
                item.comets.forEach((el, i) => place(el, PULSE.length * COMET_LAYERS[i]));
            }
            this._flowFrame = requestAnimationFrame(draw);
        };
        this._flowFrame = requestAnimationFrame(draw);
    }
    // The cycle, measured as the distance the pulses travel in it: the inverter's pulse crossing its line and the
    // gateway ([toGateway]) and then running on into HOME. Both are fixed by the scene's geometry.
    _pulseCycle() {
        if (!this._cycle) {
            const wire = id => this._flowItems.find(item => item.id === id).wire;
            const inverter = wire('inverterFlow'), home = wire('homeFlow');
            const exit = inverter.getPointAtLength(inverter.getTotalLength()), entry = home.getPointAtLength(0);
            const toGateway = inverter.getTotalLength() + Math.hypot(entry.x - exit.x, entry.y - exit.y);
            this._cycle = { toGateway, cycle: toGateway + home.getTotalLength() + PULSE.length };
        }
        return this._cycle;
    }
    // How far into the cycle a line's pulse starts: the inverter's pulse and the lines into the gateway start the
    // cycle, lines out of the gateway start as the inverter's pulse comes out of the gateway, and the solar pulse is
    // halfway into the inverter as the cycle starts.
    _pulseStart(item) {
        const { toGateway, cycle } = this._pulseCycle();
        if (item.id === 'solarFlow') {
            item.length ||= item.wire.getTotalLength();
            return cycle - item.length - PULSE.length / 2;
        }
        const end = GATEWAY_ENDS[item.id];
        return end && (end === 'start') !== !!this._flowStates[item.id].reverse ? toGateway : 0;
    }
    // The blur region is fixed in scene units because a level or upright path has no area to scale from.
    _addGlowFilter(item) {
        const ns = 'http://www.w3.org/2000/svg', pad = 24, box = item.wire.getBBox();
        const filter = document.createElementNS(ns, 'filter');
        filter.id = `glow-${item.id}`;
        for (const [name, value] of Object.entries({ filterUnits: 'userSpaceOnUse', x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad }))
            filter.setAttribute(name, value);
        filter.innerHTML = '<feGaussianBlur stdDeviation="3"/>';
        this.root.querySelector('defs').append(filter);
        item.glow.setAttribute('filter', `url(#${filter.id})`);
    }
    // Distance along the parent's path to the point where the branch starts.
    _forkDistance(parent, branch) {
        const start = branch.wire.getPointAtLength(0);
        let nearest = 0, best = Infinity;
        for (let at = 0; at <= parent.length; at += .5) {
            const point = parent.wire.getPointAtLength(at);
            const distance = Math.hypot(point.x - start.x, point.y - start.y);
            if (distance < best) { best = distance; nearest = at; }
        }
        return nearest;
    }
    disconnectedCallback() {
        if (this._chartObserver) { this._chartObserver.disconnect(); this._chartObserver = null; }
        if (this._flowFrame) cancelAnimationFrame(this._flowFrame);
        this._flowFrame = null;
        clearInterval(this._statTimer);
        this._statTimer = null;
        clearInterval(this._historyTimer);
        this._historyTimer = null;
    }
    _update() {
        if (!this._hass)
            return;
        this._socEntity = this._ent('battery_soc');
        if (this._shown.has('scene')) this._updateReadings();
        if (this._shown.has('metrics')) {
            this._id('legendEVAC').hidden = !this._has(this._ent('ac_charger_power'));
            this._id('legendEVDC').hidden = !this._has(this._ent('dc_charger_power'));
        }
        if (this._shown.has('tiles')) this._updateDaily();
        if (this._shown.has('battery') && this.config.battery_present) this._updateBattery();
        this._updateSoc();
        this._updateEnergy();
    }
    // The scene's readings and flows.
    _updateReadings() {
        const n = x => this._num(x)
          , e = key => this._ent(key)
          , kw = key => this._scaled(this._ent(key))   // kW or kWh, whatever unit the entity reports
          , pv = kw('pv_power')
          , home = this._homePower();
        // Without a battery, its power is 0.
        const batRaw = this.config.battery_present ? kw('battery_power') : 0, bat = batRaw === null ? null : batRaw * this._batterySign();
        const soc = n(this._socEntity);
        const imp = kw('grid_import_power')
          , exp = kw('grid_export_power');
        const ac = kw('ac_charger_power')
          , dc = kw('dc_charger_power');
        const hasAc = this._has(e('ac_charger_power')), hasDc = this._has(e('dc_charger_power'));
        this._id('dcGear').hidden = !this._has(e('dc_charger_limit'));
        this._id('acNode').hidden = !hasAc;
        this._id('dcNode').hidden = !hasDc;
        this._chargers = { ac: hasAc, dc: hasDc };
        // With car_shown: auto, the garage patch hides the car unless a vehicle is connected to the AC charger, a charger
        // has power (either way for DC: the car may supply the house) or car_charging says so. With the double garage, the
        // first car is the AC charger's and the second the DC charger's (or car_charging_2's). car_shown(_2) true or false
        // overrides it, and so does a binary_sensor while it is on or off, or a device_tracker while it is home or elsewhere.
        const reads = key => this._hass.states[e(key)]?.state?.toLowerCase()
          , charging = key => ['on', 'charging', 'true'].includes(reads(key)) || Number(reads(key)) > 0
          , forced = key => {
              const shown = this.config[key], sensor = typeof shown === 'string' && shown !== 'auto' ? this._hass.states[shown]?.state : undefined;
              if (typeof shown === 'boolean') return shown;
              if (shown?.startsWith?.('device_tracker.')) return sensor === undefined || sensor === 'unknown' || sensor === 'unavailable' ? undefined : sensor === 'home';
              return sensor === 'on' || sensor === 'off' ? sensor === 'on' : undefined;
          }
          , acCar = AC_CONNECTED.has(reads('ac_charger_state')) || ac > 0.025
          // The DC charger reads the vehicle's SOC for as long as its gun is in, charging or not (0 without a vehicle).
          , dcCar = DC_CONNECTED.has(dcStateKey(reads('dc_charger_state'))) || Math.abs(dc ?? 0) > 0.025 || n(e('dc_charger_vehicle_soc')) > 0
          , { garage } = this.config, double = garage === 'double' || (garage === 'auto' && hasAc && hasDc);
        // `garage: auto` is the double garage while both chargers are there, a bay for each one's car.
        this._doubleGarage = double;
        this._carWanted = [
            forced('car_shown') ?? (acCar || (!double && dcCar) || charging('car_charging')),
            double && (forced('car_shown_2') ?? (dcCar || charging('car_charging_2'))),
        ];
        // Each car's charger shows its cable plugged in while the vehicle is connected or charging, if the car is shown.
        this._plugged = [acCar || (!double && dcCar) || charging('car_charging'), double && (dcCar || charging('car_charging_2'))];
        // Its light glows, pulsing, while the charger has power (either way for DC) or reads Charging (or Discharging).
        const acOn = ac > 0.025 || reads('ac_charger_state') === 'charging'
          , dcOn = Math.abs(dc ?? 0) > 0.025 || ['charging', 'discharging'].includes(dcStateKey(reads('dc_charger_state')));
        this._chargingNow = [acOn || (!double && dcOn), double && dcOn];
        this._showCars();
        const grid = imp !== null && imp > 0 ? imp : exp !== null && exp > 0 ? -exp : imp ?? (exp === null ? null : -exp);
        this._text('pv', this._power(pv));
        this._text('home', this._power(home));
        if (this.config.battery_present) {
            this._text('battery', this._power(bat));
            this._text('soc', soc === null ? '—' : `${soc.toFixed(1)}%`);
            const battStatus = bat === null ? '' : bat > 0.025 ? 'Charging' : bat < -.025 ? 'Discharging' : 'Idle', remaining = this._batteryRemaining(bat, soc, home);
            this._learnOverhead(pv, imp, exp, bat, ac, dc, home);
            // The bracket stays on one line: a narrow column wraps before it.
            this._text('battStatus', remaining ? `${battStatus} (${remaining})` : battStatus);
        }
        this._text('grid', this._power(grid));
        this._text('gridStatus', grid === null ? '' : grid > 0.025 ? 'Importing' : grid < -.025 ? 'Exporting' : 'Idle');
        const phases = this._gridPhases();
        this._id('gridButton').disabled = !phases;
        this._id('gridMore').hidden = !phases;
        const loads = this._homeLoads().length;
        this._id('homeButton').disabled = !loads;
        this._text('gridLabel', this.config.show_grid_voltage ? this._gridLabel(phases) : '');
        const phase = this._hass.states[e('phase_mode')]?.state;
        this._text('phaseMode', !this.config.show_phase_mode ? '' : phase === 'on' ? 'Power Per Phase Mode' : phase === 'off' ? 'Total Power Mode' : '');
        const acTotal = kw('ac_charger_total_energy');
        this._text('acTotal', !this.config.show_lifetime || acTotal === null ? '' : `${this._kwh(acTotal)} consumed`);
        this._parts('dcLifetime', !this.config.show_lifetime ? [] : this._lifetime(kw('dc_charger_lifetime_charged_energy'), kw('dc_charger_lifetime_discharged_energy')));
        this._text('ac', this._power(ac));
        this._text('dc', this._power(dc));
        // ac_charger_soc / ac_charger_range at the top level are the original keys and still work.
        const carEntity = e('ac_charger_vehicle_soc') ?? (this.config.entities?.ac_charger_vehicle_soc === undefined ? this.config.ac_charger_soc : null)
          , rangeEntity = e('ac_charger_vehicle_range') ?? (this.config.entities?.ac_charger_vehicle_range === undefined ? this.config.ac_charger_range : null);
        const car = carEntity ? n(carEntity) : null
          , range = rangeEntity ? n(rangeEntity) : null
          , dcsoc = n(e('dc_charger_vehicle_soc'));
        // Sigenergy Local Modbus 2.0 stores keys (charging, not_connected) that Home Assistant labels in the user's language;
        // otherwise the state is already the label.
        const acEntity = this._hass.states[e('ac_charger_state')], acRaw = acEntity?.state
          , acLabel = acEntity && this._hass.formatEntityState ? this._hass.formatEntityState(acEntity) : acRaw
          , acState = acRaw && !['unknown', 'unavailable'].includes(acRaw) ? (acLabel && acLabel !== acRaw ? acLabel : acRaw.split('-')[0]) : '';
        const carText = !carEntity ? '' : car === null ? 'Vehicle SOC unavailable' : `${car.toFixed(0)}%${range === null ? '' : ` · ${range.toFixed(0)} km`}`;
        this._parts('acSoc', [acState, carText]);
        // The inverter reports 0% with no DC vehicle attached; a genuine 0% while charging is still shown.
        // Negative DC power is the vehicle supplying the house.
        const dcState = dc === null ? '' : dc > 0.025 ? 'Charging' : dc < -0.025 ? 'Discharging' : '';
        const dcSocText = dcsoc === null || (dcsoc === 0 && !dcState) ? '' : `Vehicle SOC ${dcsoc.toFixed(0)}%`;
        this._parts('dcSoc', [dcState, dcSocText]);
        // The battery link follows the battery: positive power charges it, so the pulse runs from the gateway to
        // the cabinet; negative power discharges it, so the pulse runs from the cabinet to the gateway.
        this._flow('solarFlow', pv);
        this._flow('inverterFlow', bat === null ? null : -bat);
        this._flow('homeFlow', home);
        this._flow('gridFlow', grid === null ? null : -grid);
        this._updatePv();
        this._updateGrid();
        this._updateHome();
        this._text('stamp', new Date().toLocaleTimeString([], { timeZone: this._zone }));
    }
    // The Battery level panel.
    _updateBattery() {
        const soc = this._num(this._socEntity), cap = this._scaled(this._ent('battery_capacity'));
        this._id('socLevel').dataset.entity = this._socEntity ?? '';
        this._text('socLarge', soc === null ? '—' : `${soc.toFixed(1)}%`);
        this._id('socFill').style.width = `${Math.min(100, Math.max(0, soc ?? 0))}%`;
        this._text('capacityText', cap === null ? '' : `${((soc ?? 0) * cap / 100).toFixed(1)} of ${cap.toFixed(1)} kWh`);
    }
    // Today's sunrise and sunset, for the scene's day and night; the chart shows those of the day it shows.
    _updateSunTimes() {
        this._sunTimes = this._sunFor(new Date());
        if (!this._id('sunTimes')) return;
        const view = this._view(), sun = view.live ? this._sunTimes : this._sunFor(view.start);
        this._id('sunTimes').style.display = view.range === 'Day' ? '' : 'none';
        const fmt = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: this._zone });
        this._text('sunrise', `Sunrise ${sun ? fmt(sun.rise) : '—'}`);
        this._text('sunset', `Sunset ${sun ? fmt(sun.set) : '—'}`);
    }
    // Sunrise and sunset on [date]'s day from Home Assistant's location, null without one or in polar day or night.
    // (sun.sun's next_rising / next_setting move to tomorrow once today's have passed.)
    _sunFor(date) {
        const lat = Number(this._hass?.config?.latitude);
        const lon = Number(this._hass?.config?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
        // SunCalc solar equations, evaluated at local noon for the selected day.
        const day = zoneParts(date, this._zone);
        const noon = zoneDate(this._zone, day.y, day.m, day.d, 12);
        const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545;
        const toJulian = d => d.valueOf() / dayMs - .5 + J1970;
        const fromJulian = j => new Date((j + .5 - J1970) * dayMs);
        const lw = -lon * rad, phi = lat * rad;
        const d = toJulian(noon) - J2000;
        const n = Math.round(d - .0009 - lw / (2 * Math.PI));
        const ds = .0009 + lw / (2 * Math.PI) + n;
        const M = rad * (357.5291 + .98560028 * ds);
        const C = rad * (1.9148 * Math.sin(M) + .02 * Math.sin(2 * M) + .0003 * Math.sin(3 * M));
        const L = M + C + rad * 102.9372 + Math.PI;
        const dec = Math.asin(Math.sin(L) * Math.sin(rad * 23.4397));
        const Jnoon = J2000 + ds + .0053 * Math.sin(M) - .0069 * Math.sin(2 * L);
        const cosH = (Math.sin(-.833 * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
        if (cosH < -1 || cosH > 1) return null;
        const h = Math.acos(cosH);
        const Jset = J2000 + (.0009 + (h + lw) / (2 * Math.PI) + n) + .0053 * Math.sin(M) - .0069 * Math.sin(2 * L);
        const Jrise = Jnoon - (Jset - Jnoon);
        return { rise: fromJulian(Jrise).getTime(), set: fromJulian(Jset).getTime() };
    }
    _wireStatistics() {
        // The view starts at the configured period, and keeps the one chosen in the header while the period is unchanged.
        if (this._stat?.period !== this.config.period) this._stat = { range: PERIODS[this.config.period], date: new Date(), selection: null, flows: null, period: this.config.period };
        const stat = this._stat;
        if (!this._id('statRange')) return;
        this._id('statRange').value = stat.range;
        this._id('statRange').addEventListener('change', event => {
            Object.assign(stat, { range: event.target.value, date: new Date(), selection: null });
            this._loadView();
        });
        const step = direction => {
            Object.assign(stat, { date: statStep(stat.range, stat.date, direction, this._zone), selection: null });
            this._loadView();
        };
        this._id('statPrev').addEventListener('click', () => step(-1));
        this._id('statNext').addEventListener('click', () => step(1));
        const chart = this._id('statChart');
        if (!chart) return this._statControls();
        const choose = target => {
            const node = target.closest?.('[data-side]');
            if (!node) return;
            const { side } = node.dataset, index = Number(node.dataset.index);
            stat.selection = stat.selection?.side === side && stat.selection.index === index ? null : { side, index };
            this._drawStat();
        };
        chart.addEventListener('click', event => choose(event.target));
        chart.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            choose(event.target);
        });
        chart._redraw = () => this._drawStat();
        this._id('statCopy').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(`${this._statJson}\n${this._id('statDebug').textContent}`);
                this._text('statCopied', 'Copied');
            } catch (error) {
                this._text('statCopied', 'Copy failed: use Download');
            }
        });
        this._statControls();
        this._drawStat();
    }
    // The view chosen in the header, which everything but the scene and the battery level follows: [range] and the window
    // [start, end) containing [date]; [current] when it holds now, [live] for today's Day, read from the sensors.
    _view() {
        const { range, date } = this._stat ?? { range: 'Day', date: new Date() }, [start, end] = statWindow(range, date, this._zone);
        const now = Date.now(), current = start.getTime() <= now && now < end.getTime();
        return { range, date, start, end, current, live: range === 'Day' && current, key: `${range} ${start.getTime()}` };
    }
    // Loads what the view shows; [refresh] is the periodic reload of a current view, which leaves live parts alone.
    _loadView(refresh = false) {
        const view = this._view();
        if (this._stat) this._stat.follow = view.current;
        const shown = part => this._shown.has(part);
        if (!refresh) this._blankCharts();
        this._statControls();
        if (shown('sankey')) this._loadStatistics();
        // Today's tiles read the sensors, so they have no gaps to mark.
        if (shown('metrics') || shown('sankey') || (shown('tiles') && !view.live)) this._loadGaps();
        if (refresh && view.live) return;
        if (shown('tiles')) this._loadTiles(refresh);
        if (!shown('metrics')) return;
        if (view.range === 'Day') { if (!refresh || !view.live) this._loadHistory(); }
        else this._loadBars();
        this._updateSunTimes();
    }
    // A new view blanks the charts, keeping their size, with a busy mark until its data arrives.
    _blankCharts() {
        const chart = this._id('chart'), stat = this._id('statChart');
        this._chartLive = null;
        if (this._stat) this._stat.flows = null;
        if (chart) {
            this._hideHover(chart, this._id('chartTip'));
            chart.replaceChildren();
            chart._redraw = chart._chart = null;
            this._text('chartStatus', 'Loading…');
            this._id('chartBusy').hidden = false;
        }
        if (stat) {
            stat.replaceChildren();
            this._id('statSummary').hidden = true;
            this._id('statCards').replaceChildren();
            this._id('statBusy').hidden = false;
        }
    }
    // Gaps in the recording: the hours (Day, Week, Month) or days (Year, Lifetime) of the view in which a counter the
    // card reads has no recorder statistics, up to the last complete one. The tiles' counters are checked from the day the
    // card's first statistics start, so a counter added later shows the time it missed; the others (chargers, EVDC,
    // third-party PV) from their own first day. [_gaps] holds the merged ranges, each with the ids it affects.
    async _loadGaps() {
        const view = this._view(), zone = this._zone;
        if (!this._hass || typeof this._hass.callWS !== 'function') return;
        const tiles = DAILY_TILES.map(([, key, , third, statKey, statThird]) => this._tileSources(key, third, statKey, statThird).ids);
        const core = new Set(tiles.map(ids => ids[0]).filter(Boolean)), daily = DAILY_TILES.map(([, key]) => this._ent(key)).filter(id => id && this._has(id));
        const checked = [...new Set([...tiles.flat(), ...this._statIds().ids])], all = [...new Set([...checked, ...daily])];
        if (!checked.length) return;
        try {
            // Each id's first day with statistics, kept for the card's life.
            const signature = all.join(',');
            if (this._firsts?.signature !== signature) {
                const months = await this._statistics(all, new Date(Date.UTC(2015, 0, 1)), new Date(), 'month', ['change']);
                const firstMonth = Object.values(months).map(rows => rows[0]?.start).filter(t => t !== undefined).map(t => typeof t === 'number' ? t : Date.parse(t));
                const firsts = new Map();
                if (firstMonth.length) {
                    const from = new Date(Math.min(...firstMonth)), last = zoneParts(Math.max(...firstMonth), zone);
                    const days = await this._statistics(all, from, zoneDate(zone, last.y, last.m + 1, 1), 'day', ['change']);
                    for (const id of all) { const t = days[id]?.[0]?.start; if (t !== undefined) firsts.set(id, typeof t === 'number' ? t : Date.parse(t)); }
                }
                this._firsts = { signature, firsts };
            }
            const { firsts } = this._firsts, origin = Math.min(...[...core, ...daily].map(id => firsts.get(id) ?? Infinity));
            const hourly = !['Year', 'Lifetime'].includes(view.range), now = Date.now();
            // An hour counts once Home Assistant has had time to compile it; a day once it is over.
            const end = Math.min(view.end.getTime(), hourly ? now - 5400e3 : zoneMidnight(now, zone).getTime());
            const ranges = [];
            if (end > view.start.getTime() && Number.isFinite(origin)) {
                const rows = await this._statistics(checked, view.start, new Date(end), hourly ? 'hour' : 'day', ['change']);
                const startOf = row => typeof row.start === 'number' ? row.start : Date.parse(row.start);
                for (const id of checked) {
                    const from = Math.max(view.start.getTime(), core.has(id) ? origin : firsts.get(id) ?? Infinity), have = new Set((rows[id] ?? []).map(startOf));
                    // Hours as Home Assistant aligns them, on the hour in UTC; days at midnight in its time zone.
                    const next = hourly ? t => t + 3600e3 : t => { const p = zoneParts(t, zone); return zoneDate(zone, p.y, p.m, p.d + 1).getTime(); };
                    let t = hourly ? Math.ceil(from / 3600e3) * 3600e3 : zoneMidnight(from, zone).getTime();
                    if (!hourly && t < from) t = next(t);
                    for (; t < end; t = next(t)) if (!have.has(t)) ranges.push({ start: t, end: next(t), ids: new Set([id]) });
                }
            }
            // Merged across ids: one range per stretch, with every id missing in it.
            ranges.sort((a, b) => a.start - b.start);
            const merged = [];
            for (const range of ranges) {
                const last = merged[merged.length - 1];
                if (last && range.start <= last.end) { last.end = Math.max(last.end, range.end); range.ids.forEach(id => last.ids.add(id)); }
                else merged.push({ ...range, ids: new Set(range.ids) });
            }
            if (view.key !== this._view().key) return;
            this._gaps = { key: view.key, ranges: merged, hourly };
        } catch (e) {
            if (view.key !== this._view().key) return;
            this._gaps = { key: view.key, ranges: [], hourly: true };
        }
        this._updateDaily();
        this._markStatGap();
        this._id('chart')?._redraw?.();
    }
    // The current view's gaps within [start, end), for [ids] when given.
    _gapsIn(start, end, ids) {
        const gaps = this._gaps?.key === this._view().key ? this._gaps : null;
        return (gaps?.ranges ?? []).filter(r => r.start < end && r.end > start && (!ids || ids.some(id => r.ids.has(id))));
    }
    // "1 Feb – 9 Feb 2026 (9 days)", "6 Nov 03:00 – 05:00 (2 h)".
    _gapText(ranges) {
        const zone = this._zone, hourly = this._gaps?.hourly;
        const day = t => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone });
        const time = t => zoneMidnight(t, zone).getTime() === t ? 'midnight' : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: zone });
        const parts = ranges.slice(0, 4).map(r => {
            const hours = Math.round((r.end - r.start) / 3600e3), length = hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
            if (!hourly) return `${day(r.start)}${hours > 24 ? ` – ${day(r.end - 1)}` : ''} (${length})`;
            return day(r.start) === day(r.end - 1) ? `${day(r.start)} ${time(r.start)} – ${time(r.end)} (${length})` : `${day(r.start)} ${time(r.start)} – ${day(r.end - 1)} ${time(r.end)} (${length})`;
        });
        return parts.join(', ') + (ranges.length > 4 ? ` and ${ranges.length - 4} more` : '');
    }
    _gapNote(what, ranges) {
        return `${what}: Home Assistant has no data recorded for ${this._gapText(ranges)}. Energy from that time is missing here, or, if the inverter kept counting, counted when recording resumed.`;
    }
    _markStatGap() {
        const view = this._view(), mark = this._id('statGap');
        if (!mark) return;
        const ranges = this._gapsIn(view.start.getTime(), view.end.getTime(), this._statIds().ids);
        mark.hidden = !ranges.length;
        mark.dataset.note = ranges.length ? this._gapNote('Energy statistics', ranges) : '';
    }
    _showNote(anchor) {
        const note = this._id('gapNote'), rect = anchor.getBoundingClientRect();
        note.textContent = anchor.dataset.note ?? '';
        note.hidden = !note.textContent;
        note.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 280))}px`;
        note.style.top = `${rect.bottom + 6}px`;
    }
    // The ids a tile reads for a view other than today's Day: its lifetime counter, else its daily sensor.
    _tileSources(key, third, statKey, statThird) {
        const sources = (k, t) => {
            const own = this._ent(k);
            return own && this._has(own) ? (t ? this._pvSources(k, t, true) : [own]).filter(id => this._has(id)) : [];
        };
        const lifetime = sources(statKey, statThird);
        return lifetime.length ? { ids: lifetime } : { ids: sources(key, third), daily: true };
    }
    _updateDaily() {
        const view = this._view(), tiles = this._tiles?.key === view.key ? this._tiles : null;
        for (const [el, key, , third] of DAILY_TILES) {
            const id = this._ent(key), tile = this._id(el)?.closest('.stat');
            if (!this._id(`${el}Gap`)) continue;
            if (!tile) continue;
            tile.hidden = !id;
            if (!id) continue;
            this._text(el, this._energy(view.live ? this._tileLive(key, third) : tiles?.values?.get(el) ?? null));
            tile.dataset.entity = id;
            // Today's tiles read the sensors themselves, which a gap in the recording doesn't touch.
            const [, , label, , statKey, statThird] = DAILY_TILES.find(([found]) => found === el), mark = this._id(`${el}Gap`);
            const ranges = view.live ? [] : this._gapsIn(view.start.getTime(), view.end.getTime(), this._tileSources(key, third, statKey, statThird).ids);
            mark.hidden = !ranges.length;
            mark.dataset.note = ranges.length ? this._gapNote(label, ranges) : '';
        }
        this._updateForecastTile();
    }
    _tileLive(key, third) {
        return third ? this._pvTotal(key, third) : this._scaled(this._ent(key));
    }
    // A view other than today's Day: each tile's lifetime counter's recorder statistics over the view, as the energy
    // metrics and the energy statistics read them, so the three agree; a counter keeps counting through a gap in the
    // recording, which a daily sensor loses. Without the counter, the daily sensor's statistics up to today, plus its
    // reading when the view holds today. The solar total adds the third-party inverter's, as today's does. A past day
    // also has its solar forecast, the last state its entity recorded that day.
    async _loadTiles(refresh = false) {
        const view = this._view(), zone = this._zone;
        if (view.live || !this._hass) return this._updateDaily();
        const tiles = this._tiles = refresh && this._tiles?.key === view.key ? this._tiles : { key: view.key };
        this._updateDaily();
        const end = view.current ? new Date() : view.end, midnight = new Date(Math.min(view.end.getTime(), zoneMidnight(Date.now(), zone).getTime()));
        const period = view.range === 'Day' ? 'hour' : DAILY_BARS.has(view.range) ? 'day' : 'month', forecastId = this._ent('solar_forecast_today');
        const list = DAILY_TILES.map(([el, key, , third, statKey, statThird]) => ({ el, key, third, ...this._tileSources(key, third, statKey, statThird) }));
        const ids = daily => [...new Set(list.filter(tile => !!tile.daily === daily).flatMap(tile => tile.ids))];
        try {
            const [lifetime, daily, history] = await Promise.all([
                ids(false).length ? this._statistics(ids(false), view.start, end, period, ['change']) : {},
                ids(true).length && midnight > view.start ? this._statistics(ids(true), view.start, midnight, period, ['change']) : {},
                view.range === 'Day' && forecastId && this._has(forecastId) ? this._history([forecastId], view.start, view.end) : null,
            ]);
            if (tiles !== this._tiles) return;
            const change = (statistics, id) => statistics?.[id]?.length ? statistics[id].reduce((sum, row) => sum + Math.max(0, Number(row.change) || 0), 0) * this._factor(id) : null;
            tiles.values = new Map(list.map(tile => {
                const [own, ...rest] = tile.ids.map(id => change(tile.daily ? daily : lifetime, id));
                const recorded = own === null || own === undefined ? null : rest.reduce((sum, v) => sum + (v ?? 0), own);
                const today = tile.daily && view.current ? this._tileLive(tile.key, tile.third) : null;
                return [tile.el, recorded === null && today === null ? null : (recorded ?? 0) + (today ?? 0)];
            }));
            const points = history ? this._series(history.data, [forecastId])[0].filter(p => p.t < view.end.getTime()) : [];
            tiles.forecast = points.length ? points[points.length - 1].v * this._factor(forecastId) : null;
        } catch (e) {
            if (tiles !== this._tiles) return;
            Object.assign(tiles, { values: new Map(), forecast: null });
        }
        this._updateDaily();
    }
    // The period's date format: date_format, else the order set in Home Assistant's profile (Date format) with its
    // language's separator, else ISO. The profile's default (Language) and System leave ISO.
    _dateFormat() {
        const { date_format: format } = this.config, match = DATE_FORMAT.exec(format);
        const fields = match && [match[1], match[3], match[4]];
        if (match) return { order: fields.map(field => field[0]).join(''), sep: match[2], short: fields.includes('YY') };
        const { date_format: order, language } = this._hass?.locale ?? {};
        if (!['DMY', 'MDY', 'YMD'].includes(order)) return { order: 'YMD', sep: '-' };
        let sep = '/';
        try {
            sep = new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date()).find(part => part.type === 'literal')?.value.trim() || '/';
        } catch { }
        return { order, sep };
    }
    _statControls() {
        if (!this._stat || !this._id('statDate')) return;
        const { range, date } = this._stat, lifetime = range === 'Lifetime';
        // Each date stays whole; a week's range wraps between its dates.
        const label = this._id('statDate'), text = statLabel(range, date, this._zone, this._dateFormat());
        if (label.textContent !== text) label.replaceChildren(...text.split(' – ').flatMap((part, i) => [...(i ? [' – '] : []), Object.assign(document.createElement('span'), { textContent: part })]));
        this._id('statPrev').disabled = lifetime;
        this._id('statNext').disabled = lifetime || statWindow(range, statStep(range, date, 1, this._zone), this._zone)[0] > new Date();
    }
    // Recorder statistics of [ids] by [period], keeping the rows that start in [start, end): Home Assistant also returns
    // the period that starts at [end] (a day's request ending at midnight gets today's row so far).
    async _statistics(ids, start, end, period, types) {
        const result = await this._hass.callWS({ type: 'recorder/statistics_during_period', start_time: start.toISOString(), end_time: end.toISOString(), statistic_ids: ids, period, types });
        const at = row => typeof row.start === 'number' ? row.start : Date.parse(row.start), from = start.getTime(), to = end.getTime();
        return Object.fromEntries(Object.entries(result ?? {}).map(([id, rows]) => [id, (rows ?? []).filter(row => at(row) >= from && at(row) < to)]));
    }
    // The lifetime counters of each source and consumer: a list of ids, null without a counter, or 'residual' for the
    // load, which has no sensor: it is what the sources supply beyond the other consumers.
    _statIds() {
        const pick = defs => defs.map(def => {
            if (!def.key) return 'residual';
            // Solar without its own counter would be the third-party inverter's alone, so it is left out instead.
            const ids = def.third ? this._pvSources(def.key, def.third, true) : [this._ent(def.key)];
            return this._has(ids[0]) ? [...new Set(ids.filter(id => this._has(id)))] : null;
        });
        const sourceIds = pick(STAT_SOURCES), sinkIds = pick(STAT_SINKS);
        return { sourceIds, sinkIds, ids: [...new Set([...sourceIds, ...sinkIds].filter(found => Array.isArray(found)).flat())] };
    }
    // Energy metrics for a range longer than a day: each day's (Week, Month), month's (Year) or year's (Lifetime) energy
    // from the lifetime counters' statistics, supplied stacked above 0 and consumed below, as in Sigenergy's app.
    async _loadBars() {
        if (!this._hass) return;
        const view = this._view(), zone = this._zone, request = this._barsRequest = (this._barsRequest ?? 0) + 1;
        this._historyRequest = (this._historyRequest ?? 0) + 1;
        this._chartLive = null;
        // A standalone card's picker, or its dates without one, sits under its title and already shows the range.
        this._text('chartTitle', this._solo ? 'Energy metrics' : `Energy metrics · ${statLabel(view.range, view.date, zone, this._dateFormat())}`);
        this._id('legendPower').hidden = true;
        const svg = this._id('chart'), legend = this._id('legendBars');
        legend.hidden = false;
        const { sourceIds, sinkIds, ids } = this._statIds();
        const show = (status, slots = [], series = []) => {
            this._text('chartStatus', status);
            const items = series.filter(s => slots.some(slot => slot.values[s.index] > .005 || slot.forecast?.[s.index] > .005)).map(s => {
                const item = document.createElement('span'), dot = Object.assign(document.createElement('i'), { className: 'dot' });
                dot.style.background = s.color;
                item.append(dot, s.name);
                return item;
            });
            if (slots.some(slot => slot.forecast)) {
                const item = document.createElement('span');
                item.append(Object.assign(document.createElement('i'), { className: 'dash' }), 'Forecast');
                items.push(item);
            }
            legend.replaceChildren(...items);
            this._hideHover(svg, this._id('chartTip'));
            this._id('chartBusy').hidden = true;
            svg._redraw = () => this._plotBars(svg, slots, series);
            svg._redraw();
        };
        if (!ids.length || typeof this._hass.callWS !== 'function') return show('No energy statistics sensors');
        this._text('chartStatus', 'Loading…');
        // Each slot's start, from its bucket's start: a day for Week, Last 7 days and Month, a month for Year, a year for Lifetime.
        const daily = DAILY_BARS.has(view.range), slotOf = daily ? t => zoneMidnight(t, zone) : {
            Year: t => { const p = zoneParts(t, zone); return zoneDate(zone, p.y, p.m, 1); }, Lifetime: t => zoneDate(zone, zoneParts(t, zone).y, 0, 1) }[view.range];
        try {
            const end = view.current ? new Date() : view.end;
            const result = await this._statistics(ids, view.start, end, daily ? 'day' : 'month', ['change']);
            if (request !== this._barsRequest) return;
            const buckets = new Map();
            for (const id of ids) {
                const factor = this._factor(id);
                for (const row of result[id] ?? []) {
                    const t = slotOf(typeof row.start === 'number' ? row.start : Date.parse(row.start)).getTime();
                    if (!buckets.has(t)) buckets.set(t, {});
                    const values = buckets.get(t);
                    values[id] = (values[id] ?? 0) + Math.max(0, Number(row.change) * factor || 0);
                }
            }
            // Every day, month or year of the range, empty or not; Lifetime starts at its first year with data.
            const starts = [], first = buckets.size ? Math.min(...buckets.keys()) : null, step = daily ? [0, 0, 1] : { Year: [0, 1, 0], Lifetime: [1, 0, 0] }[view.range];
            for (let t = view.range === 'Lifetime' ? first : view.start.getTime(); t !== null && t < view.end.getTime() && starts.length < 400;) {
                starts.push(t);
                const p = zoneParts(t, zone);
                t = zoneDate(zone, p.y + step[0], p.m + step[1], (daily ? p.d : 1) + step[2]).getTime();
            }
            const load = STAT_SINKS.findIndex(def => !def.key);
            const slots = starts.map(t => {
                const values = buckets.get(t) ?? {}, read = found => Array.isArray(found) ? found.reduce((sum, id) => sum + (values[id] ?? 0), 0) : 0;
                const sources = sourceIds.map(read), sinks = sinkIds.map(read);
                sinks[load] = buckets.has(t) ? Math.max(0, sources.reduce((a, b) => a + b, 0) - sinks.reduce((a, b, j) => a + (j === load ? 0 : b), 0)) : 0;
                const p = zoneParts(t, zone), day = new Date(t);
                return {
                    t, end: starts[starts.indexOf(t) + 1] ?? view.end.getTime(), values: BAR_SERIES.map(s => (s.source ? sources : sinks)[s.at]),
                    label: view.range === 'Lifetime' ? String(p.y) : view.range === 'Year' ? day.toLocaleDateString([], { month: 'short', timeZone: zone }) : String(p.d).padStart(2, '0'),
                    title: view.range === 'Lifetime' ? String(p.y) : view.range === 'Year' ? day.toLocaleDateString([], { month: 'long', year: 'numeric', timeZone: zone })
                        : day.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }),
                };
            });
            // Today's bar adds the forecast for the rest of the day, and the days the solar forecast covers have their own.
            const forecast = this._energyForecast, todayStart = zoneMidnight(Date.now(), zone).getTime(), solarAt = 0, loadAt = BAR_SERIES.findIndex(s => s.name === 'Load');
            if (forecast && view.current && daily)
                for (const slot of slots) {
                    const pair = slot.t === todayStart ? forecast.today : slot.t > todayStart && forecast.days.has(slot.t) ? [forecast.days.get(slot.t), forecast.load] : null;
                    if (pair) slot.forecast = { [solarAt]: pair[0] ?? 0, [loadAt]: pair[1] ?? 0 };
                }
            const series = BAR_SERIES.map((s, index) => ({ ...s, index })).filter(s => (s.source ? sourceIds : sinkIds)[s.at]);
            show(buckets.size ? `${daily ? 'Daily' : { Year: 'Monthly', Lifetime: 'Yearly' }[view.range]} energy (kWh)` : 'No recorded energy in this range', slots, series);
        } catch (error) {
            if (request !== this._barsRequest) return;
            show('Statistics unavailable');
        }
    }
    // The energy bars: one stack per slot, supplied above 0 and consumed below, on an axis rounded as the power chart's.
    _plotBars(svg, slots, series) {
        const width = Math.max(240, svg.clientWidth || 900), height = 170, ns = 'http://www.w3.org/2000/svg';
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.replaceChildren();
        const add = (tag, attrs, text, parent = svg) => {
            const el = document.createElementNS(ns, tag);
            for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
            if (text !== undefined) el.textContent = text;
            parent.append(el);
            return el;
        };
        const up = series.filter(s => s.source), down = series.filter(s => !s.source);
        const total = (slot, list) => list.reduce((sum, s) => sum + slot.values[s.index] + (slot.forecast?.[s.index] ?? 0), 0);
        const peak = Math.max(1, ...slots.flatMap(slot => [total(slot, up), total(slot, down)])), step = 10 ** Math.floor(Math.log10(peak)) / 2;
        const max = Math.ceil(peak / step - 1e-9) * step, left = 38, right = width - 12, y = v => 78 - 65 * v / max;
        const cursor = add('rect', { display: 'none', fill: 'var(--grid)', opacity: .35, rx: 3 });
        for (const v of [-max, 0, max]) {
            add('line', { x1: left, y1: y(v), x2: right, y2: y(v), stroke: 'var(--grid)', 'stroke-dasharray': '3 5' });
            add('text', { x: 2, y: y(v) + 4, fill: 'var(--axis)', 'font-size': 10 }, v.toFixed(max < 10 && v % 1 ? 1 : 0));
        }
        const slotWidth = (right - left) / Math.max(1, slots.length), barWidth = Math.min(28, slotWidth * .62);
        // Every slot is labelled while they fit, else every second, fifth… one.
        const every = [1, 2, 5, 10, 20, 50].find(n => slotWidth * n >= 26) ?? 100;
        slots.forEach((slot, i) => {
            const cx = left + slotWidth * (i + .5);
            // The recorded energy, then the forecast stacked beyond it, dashed.
            for (const [list, sign] of [[up, 1], [down, -1]]) {
                let base = 0;
                for (const forecast of [false, true])
                    for (const s of list) {
                        const v = forecast ? slot.forecast?.[s.index] : slot.values[s.index];
                        if (!(v > .005)) continue;
                        const a = y(sign * base), b = y(sign * (base + v));
                        add('rect', { x: (cx - barWidth / 2).toFixed(1), y: Math.min(a, b).toFixed(1), width: barWidth.toFixed(1), height: Math.max(.5, Math.abs(b - a)).toFixed(1), fill: s.color,
                            ...(forecast ? { 'fill-opacity': .18, stroke: s.color, 'stroke-width': 1.2, 'stroke-dasharray': '3 2' } : {}) });
                        base += v;
                    }
            }
            if (i % every === 0) add('text', { x: cx, y: 162, fill: 'var(--axis)', 'font-size': 10, 'text-anchor': 'middle' }, slot.label);
            // Missing data: a mark above the bar; its tip says what is missing.
            slot.gaps = this._gapsIn(slot.t, slot.end);
            if (slot.gaps.length) add('text', { x: cx, y: Math.max(10, y(total(slot, up)) - 4), fill: '#e0a030', 'font-size': 11, 'text-anchor': 'middle' }, '⚠');
        });
        svg._chart = { bars: true, slots, series, width, left, right, slotWidth, cursor, top: y(max), bottom: y(-max) };
        if (svg._lastHover !== undefined) this._hoverBar(svg, svg._tip, svg._lastHover);
    }
    _hoverBar(svg, tip, i) {
        const chart = svg._chart, slot = chart.slots[i];
        if (!slot) return this._hideHover(svg, tip);
        const x = chart.left + chart.slotWidth * i;
        for (const [k, v] of Object.entries({ x, width: chart.slotWidth, y: chart.top, height: chart.bottom - chart.top, display: 'inline' })) chart.cursor.setAttribute(k, v);
        const row = (s, v, forecast) => {
            const line = document.createElement('div'), dot = Object.assign(document.createElement('i'), { className: 'dot' });
            dot.style.background = s.color;
            line.append(dot, s.name, ...(forecast ? [' ', Object.assign(document.createElement('em'), { textContent: 'forecast' })] : []), Object.assign(document.createElement('span'), { textContent: `${v.toFixed(2)} kWh` }));
            return line;
        };
        const lines = [...chart.series.filter(s => slot.values[s.index] > .005).map(s => row(s, slot.values[s.index], false)),
            ...chart.series.filter(s => slot.forecast?.[s.index] > .005).map(s => row(s, slot.forecast[s.index], true))];
        if (slot.gaps?.length) {
            const line = Object.assign(document.createElement('div'), { className: 'gaptip', textContent: `⚠ No data recorded: ${this._gapText(slot.gaps)}` });
            lines.push(line);
        }
        tip.replaceChildren(Object.assign(document.createElement('b'), { textContent: slot.title }), ...(lines.length ? lines : [Object.assign(document.createElement('em'), { textContent: 'No data' })]));
        tip.hidden = false;
        const scale = svg.getBoundingClientRect().width / chart.width, cssX = (x + chart.slotWidth) * scale;
        const fitsRight = cssX + 8 + tip.offsetWidth <= svg.clientWidth;
        tip.style.left = `${fitsRight ? cssX + 8 : Math.max(0, x * scale - 8 - tip.offsetWidth)}px`;
        this._placeTip(tip);
    }
    // Energy per interval comes from the lifetime counters' recorder statistics; each interval is split into
    // flows between sources and consumers and the splits are added up.
    async _loadStatistics() {
        const stat = this._stat;
        if (!this._hass || !stat || !this.config.show_energy_statistics) return;
        this._statControls();
        if (typeof this._hass.callWS !== 'function') {
            this._text('statStatus', 'Statistics unavailable');
            return;
        }
        const { sourceIds, sinkIds, ids } = this._statIds();
        if (!ids.length) {
            stat.flows = null;
            this._drawStat();
            this._text('statStatus', 'No energy statistics sensors');
            return;
        }
        const request = this._statRequest = (this._statRequest ?? 0) + 1;
        this._text('statStatus', 'Loading…');
        const [start, end] = statWindow(stat.range, stat.date, this._zone);
        const fetchStatistics = period => this._statistics(ids, start, end, period, ['change']);
        try {
            let period = STAT_PERIODS[stat.range], result = await fetchStatistics(period);
            if (period === '5minute' && !ids.some(id => result[id]?.length)) result = await fetchStatistics(period = 'hour');
            if (request !== this._statRequest) return;
            const buckets = new Map();
            for (const id of ids) {
                const factor = this._factor(id);
                for (const row of result[id] ?? []) {
                    const time = typeof row.start === 'number' ? row.start : Date.parse(row.start);
                    if (!buckets.has(time)) buckets.set(time, {});
                    buckets.get(time)[id] = Math.max(0, Number(row.change) * factor || 0);
                }
            }
            const flows = STAT_SOURCES.map(() => STAT_SINKS.map(() => 0)), raw = {};
            for (const values of buckets.values()) {
                const read = found => Array.isArray(found) ? found.reduce((sum, id) => sum + (values[id] ?? 0), 0) : 0;
                for (const [id, value] of Object.entries(values)) raw[id] = (raw[id] ?? 0) + value;
                const sources = sourceIds.map(read), sinks = sinkIds.map(read), load = STAT_SINKS.findIndex(def => !def.key);
                sinks[load] = Math.max(0, sources.reduce((a, b) => a + b, 0) - sinks.reduce((a, b, j) => a + (j === load ? 0 : b), 0));
                allocateFlows(sources, sinks).forEach((row, i) => row.forEach((v, j) => { flows[i][j] += v; }));
            }
            Object.assign(stat, { flows, sourceIds, sinkIds });
            const debug = this._id('statDebug');
            debug.hidden = !this.config.debug_energy_statistics;
            debug.textContent = Object.entries(raw).map(([id, value]) => `${id}: ${value.toFixed(2)} kWh`).join('\n');
            const download = this._id('statDownload');
            this._id('statData').hidden = debug.hidden;
            if (!debug.hidden) {
                URL.revokeObjectURL(download.href);
                const data = { range: stat.range, period, start: start.toISOString(), end: end.toISOString(), ids, sourceIds, sinkIds, flows, buckets: [...buckets].sort((a, b) => a[0] - b[0]).map(([time, values]) => ({ time, ...values })) };
                this._statJson = JSON.stringify(data);
                download.href = URL.createObjectURL(new Blob([this._statJson], { type: 'application/json' }));
            }
            this._text('statStatus', buckets.size ? `Estimated split · ${{ '5minute': '5-minute', hour: 'hourly', day: 'daily' }[period]} data` : 'No recorded energy in this range');
            this._drawStat();
        } catch (error) {
            if (request !== this._statRequest) return;
            stat.flows = null;
            this._drawStat();
            this._text('statStatus', 'Statistics unavailable');
        }
    }
    _drawStat() {
        const stat = this._stat, svg = this._id('statChart');
        if (!svg || !stat) return;
        this._id('statBusy').hidden = true;
        const summary = this._id('statSummary'), cards = this._id('statCards');
        const clear = () => {
            svg.replaceChildren();
            svg.removeAttribute('viewBox');
            svg.style.height = '';
            summary.hidden = true;
            cards.replaceChildren();
        };
        const { flows } = stat;
        if (!flows) return clear();
        const total = (list, i) => list === STAT_SOURCES ? flows[i].reduce((a, b) => a + b, 0) : flows.reduce((a, row) => a + row[i], 0);
        const nodes = (list, ids) => list.map((def, i) => ({ ...def, i, total: total(list, i), shown: !!ids[i] })).filter(node => node.shown);
        const left = nodes(STAT_SOURCES, stat.sourceIds), right = nodes(STAT_SINKS, stat.sinkIds);
        const sum = list => list.reduce((a, node) => a + node.total, 0);
        const most = Math.max(sum(left), sum(right));
        if (!(most > 0)) return clear();
        const kWh = v => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const width = Math.max(280, svg.clientWidth || 600), compact = width < 520;
        const nodeWidth = compact ? 78 : 124, gap = 8, scale = ((compact ? 300 : 330) - gap * (Math.max(left.length, right.length) - 1)) / most;
        const place = list => {
            let y = 0;
            for (const node of list) {
                node.h = node.total > 0 ? Math.max(52, node.total * scale) : 22;
                node.y = y;
                y += node.h + gap;
            }
            return y - gap;
        };
        const height = Math.max(place(left), place(right)) + 4;
        const xLeft = nodeWidth, xRight = width - nodeWidth, middle = (xLeft + xRight) / 2;
        const selection = stat.selection && (stat.selection.side === 'src' ? left : right).find(node => node.i === stat.selection.index) ? stat.selection : null;
        const used = new Map(), ribbons = [];
        for (const a of left) for (const b of right) {
            const value = flows[a.i][b.i];
            if (!(value > 0)) continue;
            // Each end covers its node in proportion, so a node taller than its energy (minimum height) is still filled.
            const heightA = value / a.total * a.h, heightB = value / b.total * b.h, y0 = a.y + (used.get(a) ?? 0), y1 = b.y + (used.get(b) ?? 0);
            used.set(a, (used.get(a) ?? 0) + heightA);
            used.set(b, (used.get(b) ?? 0) + heightB);
            const related = selection && (selection.side === 'src' ? a.i === selection.index : b.i === selection.index);
            ribbons.push({ a, b, value, heightA, heightB, y0, y1, related });
        }
        const labels = ribbons.filter(r => r.related).map(r => ({ r, y: selection.side === 'src' ? r.y0 + r.heightA / 2 : r.y1 + r.heightB / 2 })).sort((p, q) => p.y - q.y);
        labels.forEach((label, i) => { if (i) label.y = Math.max(label.y, labels[i - 1].y + 13); });
        const touched = new Set(ribbons.filter(r => r.related).flatMap(r => [r.a, r.b]));
        const column = (list, side, x) => list.map(node => {
            const chosen = selection?.side === side && selection.index === node.i;
            const dim = selection && !chosen && !touched.has(node) ? ' dim' : '';
            // Opposite the selected node, a connected node shows just what it exchanged with the selection.
            const exchanged = selection && selection.side !== side && touched.has(node) ? (side === 'snk' ? flows[selection.index][node.i] : flows[node.i][selection.index]) : null;
            const value = kWh(exchanged ?? node.total), size = Math.min(15, (nodeWidth - 14) / (value.length * .6));
            const text = (exchanged ?? node.total) > 0
                ? `<text class="sktext" x="${x + 8}" y="${node.y + 15}" font-size="11" font-weight="700">${node.name}</text><text class="sktext" x="${x + 8}" y="${node.y + 32}" font-size="${size.toFixed(1)}" font-weight="700">${value}</text><text class="sktext" x="${x + 8}" y="${node.y + 45}" font-size="11">kWh</text>${selection || node.h < 76 ? '' : `<text class="sktext" x="${x + 8}" y="${node.y + node.h - 8}" font-size="11">${(node.total / sum(list) * 100).toFixed(2)}%</text>`}`
                : `<text class="sktext" x="${x + 8}" y="${node.y + 15}" font-size="${compact ? 10 : 11}" font-weight="700">${node.name} 0 kWh</text>`;
            return `<g class="skn${dim}" data-side="${side}" data-index="${node.i}" tabindex="0" role="button" aria-pressed="${chosen}" aria-label="${node.name} ${value} kWh"><rect class="skbox" x="${x}" y="${node.y}" width="${nodeWidth}" height="${node.h}" rx="6" fill="${node.color}"${chosen ? ' stroke="var(--fg)" stroke-width="2"' : ''}/>${text}</g>`;
        }).join('');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.style.height = `${height}px`;
        svg.innerHTML = `<defs>${ribbons.map(r => `<linearGradient id="skg${r.a.i}-${r.b.i}"><stop offset="0" style="stop-color:${r.a.color}"/><stop offset="1" style="stop-color:${r.b.color}"/></linearGradient>`).join('')}</defs>`
            + ribbons.map(r => `<path class="skr${selection ? (r.related ? ' on' : ' dim') : ''}" fill="url(#skg${r.a.i}-${r.b.i})" d="M${xLeft} ${r.y0} C${middle} ${r.y0} ${middle} ${r.y1} ${xRight} ${r.y1} L${xRight} ${r.y1 + r.heightB} C${middle} ${r.y1 + r.heightB} ${middle} ${r.y0 + r.heightA} ${xLeft} ${r.y0 + r.heightA} Z"/>`).join('')
            + labels.map(({ r, y }) => selection.side === 'src'
                ? `<text class="skpct" x="${xLeft + 6}" y="${y + 4}">${(r.value / r.a.total * 100).toFixed(2)}%</text>`
                : `<text class="skpct" text-anchor="end" x="${xRight - 6}" y="${y + 4}">${(r.value / r.b.total * 100).toFixed(2)}%</text>`).join('')
            + column(left, 'src', 0) + column(right, 'snk', width - nodeWidth);
        if (!selection) {
            summary.hidden = true;
            cards.replaceChildren();
            return;
        }
        const chosen = (selection.side === 'src' ? left : right).find(node => node.i === selection.index);
        const others = selection.side === 'src' ? right : left;
        summary.hidden = false;
        summary.innerHTML = `<b>${kWh(chosen.total)}</b><small>kWh</small><div>${chosen.caption}</div>`;
        cards.innerHTML = others.map(other => {
            const value = selection.side === 'src' ? flows[chosen.i][other.i] : flows[other.i][chosen.i];
            return value > 0 ? `<div class="statcard"><b>${(value / chosen.total * 100).toFixed(2)}%</b><span>${other.caption}</span><span>${kWh(value)} kWh</span></div>` : '';
        }).join('');
    }
    // Power metrics show the day Energy shows: today live, or a past day from the recorder's history, else, beyond it,
    // from the hourly means of the long-term statistics, each placed at the middle of its hour.
    async _loadHistory() {
        if (!this._hass)
            return;
        const request = this._historyRequest = (this._historyRequest ?? 0) + 1, view = this._view(), past = view.live ? null : view;
        this._barsRequest = (this._barsRequest ?? 0) + 1;
        if (this._id('chart')._chart?.bars) this._hideHover(this._id('chart'), this._id('chartTip'));
        this._id('legendPower').hidden = false;
        this._id('legendBars').hidden = true;
        const balance = this._homeFromBalance();
        const specs = CHART_SERIES.map(s => ({ ...s, id: this._ent(s.key) }))
            .filter(s => s.id && (!s.optional || this._has(s.id)) && !(balance && s.key === 'home_power'));
        const ids = specs.map(s => s.id);
        this._text('chartTitle', past ? 'Power metrics' : 'Power metrics · Today');
        try {
            const [from, to] = past ? [past.start, past.end] : [];
            let { start, data } = await this._history(ids, from, to);
            let hourly = false;
            if (past && !this._series(data, ids).some(points => points.length > 1)) {
                const statistics = await this._statistics(ids, from, to, 'hour', ['mean']);
                data = ids.map(id => (statistics?.[id] ?? []).map(row => ({ entity_id: id, state: String(row.mean),
                    last_changed: new Date((typeof row.start === 'number' ? row.start : Date.parse(row.start)) + 1800e3).toISOString() })));
                hourly = true;
            }
            if (request !== this._historyRequest) return;
            this._renderChart(data, specs, start, past ? { hourly } : null);
        } catch (e) {
            if (request !== this._historyRequest) return;
            this._chartLive = null;
            this._text('chartStatus', 'Recorder history unavailable');
            this._id('chart').replaceChildren();
        }
        this._id('chartBusy').hidden = true;
        this._updateSunTimes();
    }
    _series(data, ids) {
        const rows = new Map((data || []).filter(a => a?.length).map(a => [a[0].entity_id, a]));
        return ids.map(id => (rows.get(id) || []).map(s => ({
            t: Date.parse(s.last_changed || s.last_updated),
            v: Number(s.state)
        })).filter(p => Number.isFinite(p.t) && Number.isFinite(p.v)));
    }
    _renderChart(data, specs, start, past = null) {
        const notes = {
            Battery: v => v > .005 ? 'discharging' : v < -.005 ? 'charging' : '',
            Grid: v => v > .005 ? 'import' : v < -.005 ? 'export' : '',
            EVDC: v => v > .005 ? 'discharging' : v < -.005 ? 'charging' : '',
        };
        const series = this._series(data, specs.map(s => s.id)).map((points, i) => {
            // Scale W/MW to kW, flip the consumers' sign, and apply battery_power_invert to the battery series.
            const k = this._chartFactor(specs[i]);
            return {
            points: k === 1 ? points : points.map(p => ({ t: p.t, v: p.v * k })),
            color: specs[i].color,
            name: specs[i].name,
            note: notes[specs[i].name]
        };
        });
        // With home_includes_ac_charger, Home is the home series less the AC charger's, at each of their times.
        if (this._homeLessCharger()) {
            const at = key => series[specs.findIndex(s => s.key === key)];
            const house = at('home_power'), charger = at('ac_charger_power');
            if (house && charger) {
                const times = [...new Set([...house.points, ...charger.points].map(p => p.t))].sort((a, b) => a - b).filter(t => t >= house.points[0]?.t);
                house.points = times.map(t => ({ t, v: Math.min(0, this._valueAt(house.points, t) - Math.min(0, this._valueAt(charger.points, t) ?? 0)) }));
            }
        }
        // Without a home entity, Home is the balance of the other series at each of their times.
        let home = null;
        if (this._homeFromBalance()) {
            const times = [...new Set(series.flatMap(s => s.points.map(p => p.t)))].sort((a, b) => a - b);
            const spec = CHART_SERIES.find(s => s.key === 'home_power');
            home = { points: times.map(t => ({ t, v: Math.min(0, -series.reduce((sum, s) => sum + (this._valueAt(s.points, t) ?? 0), 0)) })), color: spec.color, name: spec.name };
            series.push(home);
        }
        this._chartLive = { specs, series, start, home, past };
        if (this._showPowerChart()) this._chartStatus();
        else this._text('chartStatus', `No recorded power history ${past ? 'that day' : 'today'}`);
    }
    // The power metrics chart: the day's recorded series, then, today, the forecast for the rest of the day.
    _showPowerChart() {
        const live = this._chartLive;
        if (!live) return false;
        const forecast = live.past ? null : this._chartForecast;
        this._showChart(this._id('chart'), [...live.series, ...(forecast?.series ?? [])], live.start, true);
        this._id('legendForecast').hidden = !forecast;
        return live.series.some(s => s.points.length > 1);
    }
    _chartStatus() {
        const past = this._chartLive?.past;
        if (past) return this._text('chartStatus', past.hourly ? 'Hourly averages' : 'Midnight → midnight');
        const source = this._chartForecast?.source;
        this._text('chartStatus', `Midnight → now${source ? ` · forecast from ${source}` : ''}`);
    }
    // Forecast for the rest of today, drawn dashed as in Sigenergy's app. Solar comes from Home Assistant's solar forecast
    // (Forecast.Solar, Open-Meteo, Solcast… as set up in the Energy dashboard) when there is one; otherwise, like the
    // home's load, from its average at each time of day over the last 7 days of recorder statistics.
    async _loadForecast() {
        this._forecastAt = Date.now();
        const request = this._forecastRequest = (this._forecastRequest ?? 0) + 1;
        if (typeof this._hass?.callWS !== 'function') {
            this._chartForecast = this._solarHours = this._solarSlots = null;
            return;
        }
        const zone = this._zone, now = Date.now(), today = zoneMidnight(now, zone), day = zoneParts(today, zone);
        const end = zoneDate(zone, day.y, day.m, day.d + 1).getTime();
        // Today's solar forecast, in kWh for each hour from its start, which the Solar forecast tile also reads.
        // The days after it, in kWh for each day, for the energy metrics' forecast. Each entry of the forecast is
        // counted in the hour it starts in: Solcast gives half hours, Forecast.Solar hours plus the part from sunrise.
        const hours = new Map(), days = new Map(), slots = new Map();
        try {
            const forecasts = await this._hass.callWS({ type: 'energy/solar_forecast' });
            for (const forecast of Object.values(forecasts ?? {}))
                for (const [key, wh] of Object.entries(forecast?.wh_hours ?? {})) {
                    const t = Date.parse(key);
                    if (!Number.isFinite(Number(wh)) || t < today.getTime()) continue;
                    if (t >= end) { const d = zoneMidnight(t, zone).getTime(); days.set(d, (days.get(d) ?? 0) + Number(wh) / 1000); continue; }
                    const p = zoneParts(t, zone), hour = zoneDate(zone, p.y, p.m, p.d, p.h).getTime();
                    hours.set(hour, (hours.get(hour) ?? 0) + Number(wh) / 1000);
                    slots.set(t, (slots.get(t) ?? 0) + Number(wh) / 1000);
                }
        } catch (e) {
            // No solar forecast in Home Assistant: the history average stands in.
        }
        // Today's history of the forecast for the current hour, for the Solar forecast tile's forecast up to now.
        let recorded = null;
        const hourId = this._forecastEntity('energy_current_hour');
        if (hourId && typeof this._hass.callApi === 'function') {
            try {
                const [points] = this._series((await this._history([hourId], today)).data, [hourId]);
                if (points.length) recorded = { id: hourId, points, factor: this._factor(hourId) };
            } catch (e) {
                // No recorder history: Home Assistant's solar forecast stands in.
            }
        }
        if (request !== this._forecastRequest) return;
        this._solarHours = hours.size ? hours : null;
        this._solarSlots = slots.size ? [...slots].sort((a, b) => a[0] - b[0]) : null;
        this._forecastRecorded = recorded;
        this._updateForecastTile();
        if (!this.config.show_forecast || !this._shown.has('metrics')) {
            this._chartForecast = this._energyForecast = null;
            return;
        }
        const spec = key => ({ ...CHART_SERIES.find(s => s.key === key), id: this._ent(key) });
        const specs = ['pv_power', 'home_power'].map(spec).filter(spec => this._has(spec.id));
        // With home_includes_ac_charger, the home's averages less the AC charger's.
        const charger = this._homeLessCharger() && specs.some(spec => spec.key === 'home_power') ? spec('ac_charger_power') : null;
        // Without a home entity, the home's forecast is the balance of the other flows' averages.
        const parts = this._homeFromBalance() ? ['pv_power', 'grid_import_power', 'grid_export_power', 'battery_power', 'ac_charger_power', 'dc_charger_power'].map(spec).filter(spec => this._has(spec.id)) : [];
        // Today's points from now on, starting with the value at now so the line joins the recorded one.
        const ahead = points => {
            const at = this._valueAt(points, now), rest = points.filter(p => p.t > now && p.t <= end);
            return at === null ? rest : [{ t: now, v: at }, ...rest];
        };
        // Each hour's energy (Wh) is its average power, placed at the middle of the hour. Before the forecast's first
        // hour and after its last it is night: nothing. An hour missing between them is missing from the forecast: the
        // line breaks across it.
        let solar = null;
        const breaks = [];
        if (hours.size) {
            solar = [];
            const known = [...hours.keys()].filter(t => t >= today.getTime() && t < end), first = Math.min(...known), last = Math.max(...known);
            let missing = false;
            for (let h = 0, t = today.getTime(); t < end; t = zoneDate(zone, day.y, day.m, day.d, ++h).getTime()) {
                if (!hours.has(t) && t > first && t < last) { missing = true; continue; }
                if (missing) breaks.push({ start: solar[solar.length - 1].t, end: t + 1800e3 });
                missing = false;
                solar.push({ t: t + 1800e3, v: hours.get(t) ?? 0 });
            }
        }
        let history = {}, slot = 300e3;
        const ids = [...new Set([...specs.map(spec => spec.id).filter((id, i) => !(solar && specs[i].key === 'pv_power')), ...parts.map(spec => spec.id), ...(charger ? [charger.id] : [])])];
        if (ids.length) {
            const from = zoneDate(zone, day.y, day.m, day.d - 7);
            const fetch = period => this._statistics(ids, from, today, period, ['mean']).catch(() => ({}));
            history = await fetch('5minute');
            // Five-minute statistics are kept 10 days by default; hourly ones are kept for good.
            if (!ids.some(id => history[id]?.length)) { history = await fetch('hour'); slot = 3600e3; }
        }
        if (request !== this._forecastRequest) return;
        // The average at each time of day, over the days that have data, placed at the middle of each slot.
        const profile = spec => {
            const slots = new Map(), k = this._chartFactor(spec);
            for (const row of history[spec.id] ?? []) {
                const v = Number(row.mean);
                if (!Number.isFinite(v)) continue;
                const p = zoneParts(typeof row.start === 'number' ? row.start : Date.parse(row.start), zone), minute = p.h * 60 + p.min;
                const sum = slots.get(minute) ?? [0, 0];
                sum[0] += v * k;
                sum[1]++;
                slots.set(minute, sum);
            }
            return [...slots].sort((a, b) => a[0] - b[0])
                .map(([minute, [total, count]]) => ({ t: zoneDate(zone, day.y, day.m, day.d, Math.floor(minute / 60)).getTime() + (minute % 60) * 60e3 + slot / 2, v: total / count }));
        };
        let homeDay = specs.some(spec => spec.key === 'home_power') ? profile(spec('home_power')) : [];
        if (charger) {
            const ev = new Map(profile(charger).map(p => [p.t, p.v]));
            homeDay = homeDay.map(p => ({ t: p.t, v: Math.min(0, p.v - Math.min(0, ev.get(p.t) ?? 0)) }));
        }
        let series = specs.map(spec => {
            const forecast = spec.key === 'pv_power' && solar;
            const points = ahead(forecast ? solar.map(p => ({ t: p.t, v: p.v * (spec.negate ? -1 : 1) })) : spec.key === 'home_power' ? homeDay : profile(spec));
            return { points, color: spec.color, name: spec.name, forecast: true, ...(forecast && breaks.length ? { breaks } : {}) };
        });
        if (parts.length) {
            const slots = new Map();
            for (const part of parts) for (const p of profile(part)) slots.set(p.t, (slots.get(p.t) ?? 0) + p.v);
            const home = CHART_SERIES.find(s => s.key === 'home_power');
            homeDay = [...slots].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v: Math.min(0, -v) }));
            series.push({ points: ahead(homeDay), color: home.color, name: home.name, forecast: true });
        }
        series = series.filter(s => s.points.length > 1);
        this._chartForecast = series.length ? { series, source: solar ? 'the solar forecast and the last 7 days' : 'the last 7 days' } : null;
        // The energy metrics' forecast, in kWh: the solar and home's for the rest of today, from the lines above, then
        // the solar forecast's later days, each with the home's average day.
        const energy = ({ points, breaks }) => points.reduce((sum, p, i) => !i || breaks?.some(b => points[i - 1].t < b.end && p.t > b.start) ? sum
            : sum + Math.abs(p.v + points[i - 1].v) / 2 * (p.t - points[i - 1].t) / 3600e3, 0);
        const rest = name => { const found = series.find(s => s.name === name); return found ? energy(found) : null; };
        this._energyForecast = { today: [rest('Solar'), rest('Home')], days, load: homeDay.length ? homeDay.reduce((sum, p) => sum + Math.abs(p.v), 0) * slot / 3600e3 : null };
        if (this._showPowerChart()) this._chartStatus();
        const view = this._view();
        if (view.range !== 'Day' && view.current && this._shown.has('metrics')) this._loadBars();
    }
    _chartFactor(spec) {
        return this._factor(spec.id) * (spec.negate ? -1 : 1) * (spec.key === 'battery_power' ? this._batterySign() : 1);
    }
    // Extends the drawn series with the current sensor values and redraws just the chart.
    _advanceChart() {
        const live = this._chartLive;
        if (!live || live.past || !this._hass) return;
        const t = Date.now();
        live.specs.forEach((spec, i) => {
            if (spec.key === 'home_power' && this._homeLessCharger()) {
                const home = this._homePower();
                if (home !== null) live.series[i].points.push({ t, v: -home });
                return;
            }
            const v = this._num(spec.id);
            if (v !== null) live.series[i].points.push({ t, v: v * this._chartFactor(spec) });
        });
        const home = live.home && this._homePower();
        if (home !== null && home !== undefined && live.home) live.home.points.push({ t, v: -home });
        this._id('chart')._redraw?.();
    }
    // Draws now and again whenever the chart is resized; returns whether any series has data.
    _showChart(svg, series, start, signed, top, window) {
        svg._redraw = () => this._plot(svg, series, start, signed, top, window);
        svg._redraw();
        return series.some(s => s.points.length > 1);
    }
    // As in Sigenergy's app, the time axis spans the whole day, midnight to midnight in Home Assistant's time zone (23 or
    // 25 hours when the clocks change), and the lines run from midnight to now. A [window] ends at [window.end] instead,
    // with [window.fit] fitting the value axis to the data rather than starting it at 0.
    _plot(svg, series, start, signed, top, window) {
        const now = Date.now(), day = zoneParts(start, this._zone), hour = h => zoneDate(this._zone, day.y, day.m, day.d, h).getTime();
        const end = window?.end ?? hour(24);
        const width = Math.max(240, svg.clientWidth || 900), height = 170;
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.replaceChildren();
        const ns = 'http://www.w3.org/2000/svg';
        const add = (tag, attrs, text) => {
            const el = document.createElementNS(ns, tag);
            for (const [k, v] of Object.entries(attrs))
                el.setAttribute(k, v);
            if (text !== undefined)
                el.textContent = text;
            svg.append(el);
            return el;
        };
        const values = series.filter(s => !s.tipOnly).flatMap(s => s.points.map(p => Math.abs(p.v)));
        // A signed chart's limit is rounded up to a half, whole, 5, 10, 50… kW, as in Sigenergy's app, so the labels are exact.
        const peak = Math.max(1, ...values), step = 10 ** Math.floor(Math.log10(peak)) / 2;
        let max = top ?? (signed ? Math.ceil(peak / step - 1e-9) * step : Math.max(1, Math.ceil(Math.max(0, ...values))));
        let low = 0, places = null;
        if (window?.fit && values.length) {
            // Three labels a 1, 2, 2.5 or 5 × 10ⁿ step apart, spanning the data.
            const all = series.filter(s => !s.tipOnly).flatMap(s => s.points.map(p => p.v)), least = Math.min(...all), most = Math.max(...all);
            const nice = v => { const e = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 5, 10].map(m => m * e).find(m => m >= v * (1 - 1e-9)); };
            let gap = nice(Math.max(most - least, Math.abs(most) * .02, 1e-3) * .6);
            while (Math.floor(least / gap) * gap + 2 * gap < most) gap = nice(gap * 1.01);
            low = Math.floor(least / gap) * gap;
            max = low + 2 * gap;
            places = [gap, low].reduce((d, v) => { while (d < 4 && Math.abs(Math.round(v * 10 ** d) - v * 10 ** d) > 1e-6) d++; return d; }, 0);
        }
        const left = 38, right = width - 12;
        const x = t => left + (right - left) * (t - start) / Math.max(1, end - start);
        const y = signed ? v => 78 - 65 * v / max : v => 143 - 130 * (v - low) / (max - low);
        for (const v of signed ? [-max, 0, max] : [low, (low + max) / 2, max]) {
            add('line', { x1: left, y1: y(v), x2: right, y2: y(v), stroke: 'var(--grid)', 'stroke-dasharray': '3 5' });
            add('text', { x: 2, y: y(v) + 4, fill: 'var(--axis)', 'font-size': 10 }, v.toFixed(places ?? (max < 10 && v % 1 ? 1 : 0)));
        }
        const time = h => add('text', { x: x(hour(h)), y: 162, fill: 'var(--axis)', 'font-size': 10, 'text-anchor': 'middle' }, `${String(zoneParts(hour(h), this._zone).h).padStart(2, '0')}:00`);
        // A window is labelled at every fourth hour of the clock within it.
        if (window) for (let h = 0; h < 72 && hour(h) <= end; h++) { if (hour(h) >= start && zoneParts(hour(h), this._zone).h % 4 === 0) time(h); }
        else for (let h = 0; h < 24; h += 4) time(h);
        // The power metrics' gaps in the recording: a shaded band with a mark, the lines broken across it.
        const gaps = svg === this._id('chart') && this._chartLive ? this._gapsIn(start, end) : [];
        for (const g of gaps) {
            const a = x(Math.max(start, g.start)), b = x(Math.min(end, g.end));
            add('rect', { x: a, y: y(max), width: Math.max(1, b - a), height: (signed ? y(-max) : y(low)) - y(max), fill: 'var(--grid)', opacity: .35 });
            add('text', { x: (a + b) / 2, y: y(max) + 12, fill: '#e0a030', 'font-size': 11, 'text-anchor': 'middle' }, '⚠');
        }
        // A series' own breaks (hours its data leaves out) break its line too.
        for (const { points, color, forecast, tipOnly, breaks = [] } of series) {
            if (points.length < 2 || tipOnly)
                continue;
            const d = points.map((p, j) => `${j && ![...gaps, ...breaks].some(g => points[j - 1].t < g.end && p.t > g.start) ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
            add('path', { d, fill: 'none', stroke: color, 'stroke-width': forecast ? 1.4 : 1.7, 'stroke-linejoin': 'round', ...(forecast ? { 'stroke-dasharray': '5 4' } : {}) });
        }
        const cursor = add('g', { display: 'none' });
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('stroke', 'var(--cursor)');
        line.setAttribute('stroke-dasharray', '2 3');
        cursor.append(line);
        const dots = series.map(({ color }) => {
            const dot = document.createElementNS(ns, 'circle');
            dot.setAttribute('r', 3.5);
            dot.setAttribute('fill', color);
            dot.setAttribute('stroke', 'var(--dot-edge)');
            dot.setAttribute('stroke-width', 1.5);
            cursor.append(dot);
            return dot;
        });
        svg._chart = { series, start, end, now, width, left, right, x, y, top: y(max), bottom: y(signed ? -max : low), cursor, line, dots, gaps };
        if (svg._lastHover !== undefined) this._hoverAt(svg, svg._tip, svg._lastHover);
    }
    // Linear interpolation between recorded states, matching the drawn line.
    _valueAt(points, t) {
        if (!points.length || t < points[0].t) return null;
        let lo = 0, hi = points.length - 1;
        if (t >= points[hi].t) return points[hi].v;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (points[mid].t <= t) lo = mid; else hi = mid;
        }
        const a = points[lo], b = points[hi];
        return a.v + (b.v - a.v) * (t - a.t) / Math.max(1, b.t - a.t);
    }
    _hoverChart(svg, tip, e) {
        const chart = svg._chart;
        if (!chart) return;
        const rect = svg.getBoundingClientRect();
        const ux = (e.clientX - rect.left) * chart.width / rect.width;
        if (ux < chart.left || ux > chart.right) return this._hideHover(svg, tip);
        svg._tip = tip;
        if (chart.bars) {
            svg._lastHover = Math.min(chart.slots.length - 1, Math.floor((ux - chart.left) / chart.slotWidth));
            return this._hoverBar(svg, tip, svg._lastHover);
        }
        // Past now the forecast is read; without one the readings stay at now.
        const t = chart.start + (ux - chart.left) / (chart.right - chart.left) * (chart.end - chart.start);
        svg._lastHover = chart.series.some(s => s.forecast) ? t : Math.min(chart.now, t);
        this._hoverAt(svg, tip, svg._lastHover);
    }
    _hoverAt(svg, tip, t) {
        const chart = svg._chart;
        const px = chart.x(t);
        chart.line.setAttribute('x1', px);
        chart.line.setAttribute('x2', px);
        chart.line.setAttribute('y1', chart.top);
        chart.line.setAttribute('y2', chart.bottom);
        // Up to now the recorded series are read, after it the forecast ones.
        const rows = new Map(), ahead = t > chart.now;
        chart.series.forEach((s, i) => {
            const v = !!s.forecast === ahead && !s.breaks?.some(b => b.start < t && t < b.end) ? this._valueAt(s.points, t) : null;
            chart.dots[i].setAttribute('display', v === null || s.tipOnly ? 'none' : 'inline');
            if (v === null) return;
            chart.dots[i].setAttribute('cx', px);
            chart.dots[i].setAttribute('cy', chart.y(v));
            const row = rows.get(s.name) ?? { ...s, v: 0 };
            row.v += v;
            rows.set(s.name, row);
        });
        chart.cursor.setAttribute('display', 'inline');
        const time = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: this._zone });
        // Series names can be PV string names from the card config, so the rows are built as text, not HTML.
        const lines = [...rows.values()].map(r => {
            const note = r.note?.(r.v);
            const line = document.createElement('div');
            const dot = Object.assign(document.createElement('i'), { className: 'dot' });
            dot.style.background = r.color;
            line.append(dot, String(r.name));
            if (note) line.append(' ', Object.assign(document.createElement('em'), { textContent: note }));
            const value = r.digits !== undefined ? `${r.v.toFixed(r.digits)}${r.unit ? `${r.unit === '%' ? '' : ' '}${r.unit}` : ''}` : r.unit ? `${Math.abs(r.v).toFixed(2)} ${r.unit}` : formatPower(r.v);
            line.append(Object.assign(document.createElement('span'), { textContent: value }));
            return line;
        });
        // In a gap in the recording there are no readings to show.
        const gap = chart.gaps?.filter(g => g.start <= t && t < g.end) ?? [];
        if (gap.length) {
            lines.splice(0, lines.length, Object.assign(document.createElement('div'), { className: 'gaptip', textContent: `⚠ No data recorded: ${this._gapText(gap)}` }));
            chart.dots.forEach(dot => dot.setAttribute('display', 'none'));
        }
        tip.replaceChildren(Object.assign(document.createElement('b'), { textContent: ahead ? `${time} · forecast` : time }), ...(lines.length ? lines : [Object.assign(document.createElement('em'), { textContent: 'No data' })]));
        tip.hidden = false;
        const scale = svg.getBoundingClientRect().width / chart.width;
        const cssX = px * scale;
        const fitsRight = cssX + 14 + tip.offsetWidth <= svg.clientWidth;
        tip.style.left = `${fitsRight ? cssX + 14 : Math.max(0, cssX - 14 - tip.offsetWidth)}px`;
        this._placeTip(tip);
    }
    // A tip taller than the room left below the chart moves up, so the card's edge doesn't cut it.
    _placeTip(tip) {
        tip.style.top = '';
        const card = tip.closest('ha-card, .dlg')?.getBoundingClientRect(), box = tip.getBoundingClientRect();
        if (!card) return;
        const over = box.bottom - (card.bottom - 8);
        if (over > 0) tip.style.top = `${box.top - tip.offsetParent.getBoundingClientRect().top - Math.min(over, box.top - card.top - 8)}px`;
    }
    _hideHover(svg, tip) {
        svg._lastHover = undefined;
        tip.hidden = true;
        if (svg._chart) svg._chart.cursor.setAttribute('display', 'none');
    }
}
// BEGIN ARTWORK (generated by tools/embed-artwork.py)
const ARTWORK = {
    'house_day.png': { size: [1676, 805], href: 'data:image/avif;base64,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' },
    'house_night.png': { size: [1676, 805], href: 'data:image/avif;base64,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' },
    'charger_day.png': { size: [22.41, 77.35], at: [446.88, 288.33], href: 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAGGbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAATTAAAF6gACAAAAAQAAAa4AAAMlAAAAQmlpbmYAAAAAAAIAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAABppbmZlAgAAAAACAABhdjAxQWxwaGEAAAAAGmlyZWYAAAAAAAAADmF1eGwAAgABAAEAAADDaXBycAAAAJ1pcGNvAAAAFGlzcGUAAAAAAAAALQAAAJsAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAAA5waXhpAAAAAAEIAAAADGF2MUOBABwAAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAeaXBtYQAAAAAAAAACAAEEAQKDBAACBAEFhgcAAAkXbWRhdBIACgYYFeyaZVAymAZEaACIIt1KCdnMp+/BQmFfGD8HEU/DWy+EXoofpUSBcPjQM1Z4L+elnXbGTj4ABLCBb0kY9WiSwiJLepWBQy0ghcbb/a8v1TVwIPR7aOdOazTyq+xp9ZIant3NBn46LX/+9un2fuqur1vXQZhb3ZBUiq7KioVWZe/rQwOtvjgFyusAUI3l9cIF2RmSIYgulnb6AYVfbTWq55jM5IFTtjc19uEEzwwFDg4y+M8emukTlS0Yj50V6biqeszYJSBz/sX4fJdJXgvB7cHDeELxzOe917hXzU89u4/TrYhROXOxovWl+O/43N8nkwqj8TfizBWrJ+NU96ki9hC3qdtLYEnWwEfz0VY3c9Xq6w/zf9+EcrnezwaJ4Wh4pLyllYisXmDVvWOrWyq+t/oyONob/GqvBP37ohLhaeyw69S1dvIeVXJDkGyZjTvPzJz15XTLgfiVgo10CODMZePVIIxOiUUWarZGZZ8vPyc2npOL+VAcGWSm8j8hwLxzSlcDljpbXa5ZGni1jXFQNPJJw931mgp5FwJ5wFNL5KQZKleUNINTpMXta1KATYMfp2KEYgZ7PjqNSSxKt7q0vIY4WymkQ66uBhCkai0z7KdUmTIfhWfVkCyq7rmGlUGSHBCipBv79yNVTE+JQFkpmmQKpr4AqTHWm0+mNqKlN2FFe5DheSA6N68iQkUCJTq9npLU+AQNdyTNF1gj1+Go7CjdyW3jrlpvhYOn8nbvr9aJOQ1J4pYdxcKsBBq7w4x1DD8jNBwZC1To6+pbx1usl6p2jgEVzjMICfzrfFrVON5h/9yotzkEkk1xmTs6mX8RZvyVjnx1WTSt6zFldaU6v4SXNTvuFQ/IWKjRrMG+po806S9MQC8ahIrm+PcpZhDRp201wl+iTS+uhcOhm7NeC8izTE0XtBWAZPIss0PPA3ga5AK1+SS0fEQ86E/H8sGQ7b+7zYEDS0+/hz3dNHMaB/4Z+yypf3tJm9XI4xQI9LrjD7xr13h7V0qKA+KpZIbX/ljWu/G3cZJCeiMB0PHkWlslyZ5jZP8bGGVoa/xSEpgSAAoJGBXsmmyAhoNCMtoLEePDwzKCDgAPCAAAABDdXcwonv9WYNUC4bjfjCAIA3jrCItSD/9rWO+OuAbrOP4g3GUvuzoc1rWhpTx0MnhtzonmcG9vHORi4hkBB11VMXkYAFeJXavkPzMNkyN6045XLYVwQkjLCgs7fZGq5FGBtnXEIvYW8ECorfjFVhSwAK1CZYpLPpZxEQSXWmQG/NnbV+kw9bjmEmMgu0z0CwinBq1aUd7GHn6IBDxjY/RTDiL/+op3RlTGIXw2u19dC9dofgnDgWJW9Fzv1DliUpz3qC/B5E/ocXNRMC81BGCFBPO8ykaCJAtdUXB1bGs4zSy5PxSECOfgl51lvjCXeroo8UgYI3wdyKDLzwzRzXwl3gzq9An67ZcRsTXvvHXwYTqO2qfm1EXfM2249gpQKzChomtEI8iHjuTokAroGax7mTM6waZQMteEx97ALeVp94fvwjY6Kk1z7QiVv1Afhf7eJkzWrHp1z6HDN4kkwG8fMlqgDl9RUMiArCwhIBkMxzM9nMrRT2tEeC1TKJwqCtf5pZOe2ojPHIY4f1nMqYceBXkMy4o8T2Au8gzik6Q7ai+RIHG+8FIPG751FCe5XEyP8oC0zJ7ETCiyBxvhUXE21V0O8Ew/t8BHK3ZIDvXJRbdg1a8LTXOebCOVXIDa0ecl4J6l70v+CBEuhFEwB+y6Sq4TwyN0rUc2LM941bAHG+OF5/5A3Iu0ED+MR4Ktz6sky/wfZdj7KX4Fr5TmK0xwnzw/1ruTFdEeSTUttcxk2FUKmYI5tdb/ORLa8M0c5VZ24rhvj+EfOVQXlQoofCL5bD961ag5cKj7oBuNaGfKFER5SVhzyUO47ytY7r5OmbRH0U4yn9LzcTzzuyErcFgSQ9zFB4UTw+Li08nQtwG2qQa3FUwjhzpFEJIMYtkf3wwV9/LfV7YbHoqpQmXttRCSdnEWqG/DeeAw5Wp7a3MM0cjgcwnKYdT5//McBNFlBB1+xX/Zbxw9C28DpJBkVa7IzVilJ2uqSAnE75LP7s5cDbPyPgYBFBNIDrlrDiAaAkKso/uwIQE3r21PId3lNisGF+ek1NIrak4cBtJTiX7uW83IHLGxeOTekf+Fqvz/5v1krxNnjz6+s4mZvDGd+07b60tVGHnGCY7/ek+3WlkVU+j2XNbAcJJxj4x3f2xFHgIoyyTCu1czQ/bVLOw6yIGW/yJQ0ltvmNP+5lh6BgkbekIMMVqiuMd0ZQct9kWJzKSMUVrJax9MPIDWD+PoOjGBtHDWfv15UKT0EcvvPJmoDSH1M3yrd9XNqwIVh/zhG0r/GWMxga7pggmyIp1DiieZpN1aOhZmVxtt7iehl+0dfjoKazPsBlO4g/1n++gZS1+FjtO6FHfrJ9dbZmBmI8uf8HXunYIDwfoh2lIAvXK8tCLMOUXt4aKEXrG+ufvaaRD0kMg1dQSgKpye4qgitwHSiUMsXsQgVupz1SYEPoIr9hAkQ0QP9NCcXtpbifZx8te7/GwBMTe5wfIjG+RD+OvPtbMxC993KF6/UAi68KBNoIe3OkL+osKRQXmfLR96J3UC5LQjgjgwolqp6ZyMUSvn41fa/gi6jAWOLlQv526JhS4jMJuvGx+fQJc2VUus8QYCQh0VtkenIafdeTDPwkCkZ8N8AmBzhOulHKO3necwagT9GnudIkFHIZ6U5ubbvEAjyT3j+6ipuTe+23WB7X8WtUQZF0SkmVdruIkAWWkLo8+65cV/IWokkQy0OawkBrb3RO3DKOGvxFUtul4TpvMmcWy8vWkia090aVd42uLkNn5CYdBsJo1qtYTyrUB4xT2eGQg4ga9qBmvaExu1nWRdoEuvzkeuKE9OcCw10WbIkXp1nVqP9nKeLcsePBtRu8nQZdL3PyRJFOcAScU65DTVOnDImpv7hKqMiw69/vFOksvYYkzrC1mEzYagnGVASCAHFhvIubB51onMKIi6cI3vxWFJi37cm5kb0RgZGoYD2XaHdD3EYs0duqsjSA==' },
    'charger_night.png': { size: [22.30, 78.75], at: [445.77, 287.84], href: 'data:image/avif;base64,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' },
    'charger_day_plugged.png': { size: [67.91, 100.43], at: [446.88, 288.33], href: 'data:image/avif;base64,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' },
    'charger_night_plugged.png': { size: [68.85, 102.99], at: [445.77, 287.84], href: 'data:image/avif;base64,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' },
    'charger_day_led.png': { size: [26.29, 41.29], at: [449.41, 286.14], href: 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAGGbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAAKyAAACvwACAAAAAQAAAa4AAAEEAAAAQmlpbmYAAAAAAAIAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAABppbmZlAgAAAAACAABhdjAxQWxwaGEAAAAAGmlyZWYAAAAAAAAADmF1eGwAAgABAAEAAADDaXBycAAAAJ1pcGNvAAAAFGlzcGUAAAAAAAAANQAAAFMAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAAA5waXhpAAAAAAEIAAAADGF2MUOBABwAAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAeaXBtYQAAAAAAAAACAAEEAQKDBAACBAEFhgcAAAPLbWRhdBIACgYYFbSkyqAy9wERoBxwiN4dQs/fZBMVCWRE311FXBGmIdlnq40RYQRljCOtELtMT0AITZHdCBeMIQHjHzoMd9qrH7FuHVEYB0nptS6HVxlAA0+qYgzPUv7FJetabJjJQxKSiskNOJGRiB5142gRA9PIhzm2A2fMSzoRqwfl6ueWFoNZwNC0iVHXHrBI3+6xo5NT/I1E1ECMZkqzMQ4JHzcCKQjoMobVnhwL89hORGerfqj+Zn0EpBLUVQAutC18DYobcqC2lk+gq0NjYuL/BZ2vNIcLxIyAQrQDoPGyyRbhrylugkgG9T6zb9gQcZsZPzrVe2TPYiFZ3SXt7FGAiPHiEgAKCRgVtKTZAQ0GhDKvBUR48PDMoAA8IAAAAEDdTGvxftnMZGqdGnQsSvTfDvFGDz7Kp3sdhGzE8egkrF3wkLefXVQ/VcjCETvSdvFgxVU+jLGhmK7beuYt8LvHl4G6nRqB2fbPgb95he2qPJ+2FAe3muFOgWV3ybbFjvrDHqpcyS5hgZITiF9vPbL8hG7cYyVy32qSr5bpk/kn7kRkVoguYTs/Wq9TDYAL6SusgVZB+MlzfDSt2ivj2pUQkeyvN4On9E4LetL3pdxCdvETL5sjB7qpLa1TKM0xoTUlX0tnblQ0p/XCQ56Vpd9gdNrQQiclJuzUXtxcFZ0eVwAOLxteHKN8iSGCLdSgLPbKiIRn3yTG9qkaohZJGsmwnN3+D063fLsWA/PlEtElas0OTKo5Vv9igLYyeSfhbCgQIj/fDKPLA4VsZW+hm5fIIdPmYlhgRraPW2KoSH0rKVsgadxgQ3tPZJInE22N/EdroqNh3zLF8GSTcT49KxYZhLCZl9bs4eS7Zg2AfrgS54vY7ohoMBUqZ5hddztWcGKkEIRPBCJsiJRpHWKP1KAL6CM2sSwnul3Qofvwh203c0oo9QxDhabU9s7vYkE8rwWwe+Uys1vxcOMU8Vx+CWITElbA6/WF7/jj+z8XIhJbU31L2GUzKAndYwplGH7i+vv1XPcJhJBK1+mn52Bt7yBvd8ybf70WEeDgsfzN2DSKDkR0gdocS2+scKWm6b+a52ASj0h2HlORbp/Q6XAgVVHx+o0MqnCttqMEVxlBEI769w4HIGnyoWj7gc76qsPsyQCVAlBKt279S8xHMhMyvn1OkAC6vUXPFQbQ7bPFM98G2TTb6bl18BF0GoQMt9UOHCzTFCe/FModSQAn9Lb9YsxVvEv0eQHWx4zPlsz4zrWju+leGsZbvCH39ozP+bJM7nteGA==' },
    'charger_night_led.png': { size: [26.38, 39.18], at: [448.48, 284.93], href: 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAGGbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAAK1AAACZwACAAAAAQAAAa4AAAEHAAAAQmlpbmYAAAAAAAIAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAABppbmZlAgAAAAACAABhdjAxQWxwaGEAAAAAGmlyZWYAAAAAAAAADmF1eGwAAgABAAEAAADDaXBycAAAAJ1pcGNvAAAAFGlzcGUAAAAAAAAANQAAAE4AAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAAA5waXhpAAAAAAEIAAAADGF2MUOBABwAAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAeaXBtYQAAAAAAAAACAAEEAQKDBAACBAEFhgcAAAN2bWRhdBIACgYYFbSayqAy+gERoABgiN08PwfKQUD1hMVHd6zmOu+miwntumt1eXExf3tJddSLg3IcugdTqvltyp/iLxFnYeMWk8kUWB4tUXE0dfrIV+4rkHb40F4BhkTC2dfC/4/6sG8n9QRCP+Zf1f7RlmeiAzs+45doiTB03EOavY45DXYmhoVp712KF+hpXC9Iw77qF/2iQ/4RgWTxt2PnagewSZi3WCadV5acSLMh6iq39Fmn4H7kmBczeMAIB+b0HNYrfdjfi+y8FHnvAr39rKLD/vdjFemjX0wWBGyVJweP+pJrkegXsb81Cj7L1lBOr6DFT6Zbq8wi4NE2xijIxJpWRYT2F5ncEgAKCRgVtJrZAQ0GhDLXBER48PDMoBAAA8IAAAAE3Uxr8mCjuKjEVS3iO/EDzX1Xvt3h71GwFF6tkXdAXHcIUcI0ViAr1d/IY9nRvUxORUzabMbdXAPQNW9AcmUU5Hmm+p0bTroR251umuJBe7o+kR/jlB5tai5qNrh1VODiwCAPBj1T8kUl3KF3Mz3d2T50c3fOEhm+5rLt8kekusjqWlKkMpYFsp+0ZNA/AW+c1KU7Pl0oaKws3rTHQG7aAS0SElFAAaLXKj+k0ihdCyTJZbdelL/3WKs1NkR+MGggioOwftBD+W+ifVF3mQD4WW95uUE/BLICCRMAyhFbqNF+msJcNWHBs3MbE4+3H9/UxjtPzIraLypfm6dbnBRhAXZPLwSt/6GOZzmpFCQN5pLixw833M/nn9PgT4qKQOw5lE5zq9x6kthI/7L3LcKUczeGXcfU898iQDYk2KZR5WQkAHGzSimkM46LkdIgwyBy6KOsnW8bKAQNej63aGF9sDCZ4LMEvNar4DhCU9+48SNVjU2AsW6yvN+lC8UIIflCUDvRR7PwYUSzfPfw/ApKCoj6POu7ysNw6ZDtMTA+Tg0jgcdOevsHVfxztHzaOmXAsNGabQrdVIpsBRlmNifNPLsmLbzpbT1e2UdmSHes0V4QvevsAJMDKtvRblwx4BmA2Bo28XHQCxX8zOddzM4CeO2QX9CRC089lFGHtxTFFl95Vg/okanEMcT4gbJBXpVJajgtVKGsJ0R5eTsjJhSHjvUqf9gkeHHqmKvD8zXgLrezl7j38YBpQgo+0ANRCEE4qX9FdxeUglAL' },
    'garage_day.png': { size: [207, 202], at: [419, 233], href: 'data:image/avif;base64,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' },
    'garage_night.png': { size: [196, 202], at: [419, 233], href: 'data:image/avif;base64,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' },
};
// END ARTWORK
if (!customElements.get('sigenergy-flow-card'))
    customElements.define('sigenergy-flow-card', SigenergyFlowCard);
window.customCards = window.customCards || [];
window.customCards.push({
    type: 'sigenergy-flow-card',
    name: 'Sigenergy Flow Card',
    description: 'Animated Sigenergy power-flow dashboard'
});
// Each part of the card as a card of its own: [tag, part, name, description, size, defaults].
const SOLO_CARDS = [
    ['sigenergy-flow-scene', 'scene', 'Sigenergy Flow: House', 'The house with its live power flows', 7, {}],
    ['sigenergy-flow-battery', 'battery', 'Sigenergy Flow: Battery level', 'The battery level and stored energy', 2, { title: 'Battery level', name: '' }],
    ['sigenergy-flow-statistics', 'tiles', 'Sigenergy Flow: Energy statistics', 'Energy totals for a day, the last 7 days, a week, month, year or lifetime', 4, { title: 'Energy statistics', name: '' }],
    ['sigenergy-flow-metrics', 'metrics', 'Sigenergy Flow: Power metrics', 'Power over a day, or energy bars over a longer period', 5, { title: '', name: '' }],
    ['sigenergy-flow-sankey', 'sankey', 'Sigenergy Flow: Energy flows', 'Where the energy came from and went over a period', 7, { title: 'Energy statistics', name: '' }],
];
for (const [tag, part, name, description, size, defaults] of SOLO_CARDS) {
    if (!customElements.get(tag))
        customElements.define(tag, class extends SigenergyFlowCard {
            static tag = tag;
            static parts = [part];
            static defaults = defaults;
            static size = size;
        });
    window.customCards.push({ type: tag, name, description });
}
