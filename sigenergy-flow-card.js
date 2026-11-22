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
const PHOTO = { width: 1676, height: 557, top: 56, bottom: 10, bleed: 100 };
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
    solarFlow: 'M918 201 H945 Q955 201 955 211 V366',
    inverterFlow: 'M1010 392 H975',
    homeFlow: 'M943 392 H905 Q895 392 895 382 V350 Q895 340 885 340 H755',
    gridFlow: 'M959 432 V610',
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
// Dashed callouts from each reading to the feature it describes: below the SOLAR label to the panels, below the
// HOME label over the porch and down to its eave, across to GRID's line, and from the cabinet down and across to
// the SigenStor text.
const LEADERS = ['M900 88 V201', 'M710 88 V300 H760 V340', 'M830 540 H959', 'M1017 481 V545 H1027'];
// Reading positions: [x, y, edge], where y is the reading's top or bottom edge. [lower] places the
// SigenStor and GRID readings: the row's left edge, each reading's left edge, and the row's bottom edge.
// [chargers] is the left edge of the charger readings, centred vertically on CHARGER_Y: [wide, narrow].
// With the custom photo they sit above the car, to the right of the charger; 1120/1040 shift them right while
// keeping the text inside the protected range at the narrowest width (wide [640,1240], narrow [580,1240]).
const READINGS = {
    pv: [832, 16, 'top'],
    home: [640, 16, 'top'],
    lower: { left: 724, columns: [724, 1030], bottom: 578, start: 513 },
    chargers: [1120, 1040],
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
            <marker id="gridArrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="var(--wire-on)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>
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
          ${LEADERS.map((d, i) => battery || i !== 3 ? `<path class="leader${i === 3 ? ' lowerLeader' : ''}" data-d="${d}" d="${d}"/>` : '').join('')}
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
      .leader{fill:none;stroke:var(--leader);stroke-width:1;vector-effect:non-scaling-stroke;stroke-dasharray:3 5;stroke-linecap:round;opacity:.75;marker-end:url(#leaderDot)}
      .wire{fill:none;stroke:rgba(18,26,30,.4);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;transition:stroke .4s}
      .flow.active .wire{stroke:var(--wire-on)}
      #gridFlow.active .wire{marker-end:url(#gridArrow)}
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
      .lower{position:absolute;z-index:2;display:grid;align-items:start}.lower .node{position:static}.lower>.node:first-child{min-width:0;padding-right:calc(12px * var(--s))}.lower>.node:first-child em{white-space:normal}
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
        // SigenStor's AC output: solar less battery charging (positive battery power) less DC charging.
        const inverter = pv !== null && bat !== null ? pv - bat - (dc ?? 0) : home !== null && grid !== null ? home - grid : null;
        this._flow('solarFlow', pv);
        this._flow('inverterFlow', inverter);
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
    'house_day.png': { size: [1676, 823], href: 'data:image/avif;base64,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' },
    'house_night.png': { size: [1676, 823], href: 'data:image/avif;base64,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' },
    'charger_day.png': { size: [22.41, 77.35], at: [446.88, 288.33], href: 'data:image/avif;base64,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' },
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
