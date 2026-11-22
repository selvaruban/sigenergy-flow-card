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
const PHOTO = { width: 1676, height: 557, top: 56, bottom: 60, bleed: 100 };
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
const SCENE = { width: PHOTO.width, height: PHOTO.top + PHOTO.height + PHOTO.bottom, keep: [640, 1240], keepNarrow: [700, 1200], narrowBelow: 560, scale: 1 };
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
    gridFlow: 'M959 432 V620',
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
const LEADERS = ['M900 88 V201', 'M710 88 V300 H760 V340', 'M830 590 H959', 'M1017 481 V595 H1027'];
// Reading positions: [x, y, edge], where y is the reading's top or bottom edge. [lower] places the
// SigenStor and GRID readings: the row's left edge, each reading's left edge, and the row's bottom edge.
// [chargers] is the left edge of the charger readings, centred vertically on CHARGER_Y: [wide, narrow].
// With the custom photo they sit above the car, to the right of the charger; 1120/1040 shift them right while
// keeping the text inside the protected range at the narrowest width (wide [640,1240], narrow [700,1200]).
const READINGS = {
    pv: [832, 16, 'top'],
    home: [640, 16, 'top'],
    lower: { left: 724, columns: [724, 1030], bottom: 628, start: 563 },
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
            <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fade" stop-opacity="0"/><stop offset=".45" class="fade" stop-opacity=".4"/><stop offset="1" class="fade" stop-opacity=".65"/></linearGradient>
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
      ${CUSTOM_SCENE ? '.narrow .lead{transform:none;text-align:left}.narrow #homeLead{left:42.36% !important}' : '.narrow .lead{transform:translateX(calc(-100% - 24px * var(--s)));text-align:right}'}
      .compact .sidecol .node{max-width:calc(430px * var(--s))}.narrow .sidecol .node{max-width:calc(230px * var(--s))}.compact .sidecol em{white-space:normal}
      .compact .lower .node+.node{max-width:calc(260px * var(--s))}.narrow .lower .node+.node{max-width:calc(200px * var(--s))}.compact .lower em{white-space:normal}
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
    'house_day.png': { size: [1676, 873], href: 'data:image/avif;base64,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' },
    'house_night.png': { size: [1676, 873], href: 'data:image/avif;base64,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' },
    'charger_day.png': { size: [22.41, 77.35], at: [446.88, 288.33], href: 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAGGbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAATTAAAF6gACAAAAAQAAAa4AAAMlAAAAQmlpbmYAAAAAAAIAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAABppbmZlAgAAAAACAABhdjAxQWxwaGEAAAAAGmlyZWYAAAAAAAAADmF1eGwAAgABAAEAAADDaXBycAAAAJ1pcGNvAAAAFGlzcGUAAAAAAAAALQAAAJsAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAAA5waXhpAAAAAAEIAAAADGF2MUOBABwAAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAeaXBtYQAAAAAAAAACAAEEAQKDBAACBAEFhgcAAAkXbWRhdBIACgYYFeyaZVAymAZEaACIIt1KCdnMp+/BQmFfGD8HEU/DWy+EXoofpUSBcPjQM1Z4L+elnXbGTj4ABLCBb0kY9WiSwiJLepWBQy0ghcbb/a8v1TVwIPR7aOdOazTyq+xp9ZIant3NBn46LX/+9un2fuqur1vXQZhb3ZBUiq7KioVWZe/rQwOtvjgFyusAUI3l9cIF2RmSIYgulnb6AYVfbTWq55jM5IFTtjc19uEEzwwFDg4y+M8emukTlS0Yj50V6biqeszYJSBz/sX4fJdJXgvB7cHDeELxzOe917hXzU89u4/TrYhROXOxovWl+O/43N8nkwqj8TfizBWrJ+NU96ki9hC3qdtLYEnWwEfz0VY3c9Xq6w/zf9+EcrnezwaJ4Wh4pLyllYisXmDVvWOrWyq+t/oyONob/GqvBP37ohLhaeyw69S1dvIeVXJDkGyZjTvPzJz15XTLgfiVgo10CODMZePVIIxOiUUWarZGZZ8vPyc2npOL+VAcGWSm8j8hwLxzSlcDljpbXa5ZGni1jXFQNPJJw931mgp5FwJ5wFNL5KQZKleUNINTpMXta1KATYMfp2KEYgZ7PjqNSSxKt7q0vIY4WymkQ66uBhCkai0z7KdUmTIfhWfVkCyq7rmGlUGSHBCipBv79yNVTE+JQFkpmmQKpr4AqTHWm0+mNqKlN2FFe5DheSA6N68iQkUCJTq9npLU+AQNdyTNF1gj1+Go7CjdyW3jrlpvhYOn8nbvr9aJOQ1J4pYdxcKsBBq7w4x1DD8jNBwZC1To6+pbx1usl6p2jgEVzjMICfzrfFrVON5h/9yotzkEkk1xmTs6mX8RZvyVjnx1WTSt6zFldaU6v4SXNTvuFQ/IWKjRrMG+po806S9MQC8ahIrm+PcpZhDRp201wl+iTS+uhcOhm7NeC8izTE0XtBWAZPIss0PPA3ga5AK1+SS0fEQ86E/H8sGQ7b+7zYEDS0+/hz3dNHMaB/4Z+yypf3tJm9XI4xQI9LrjD7xr13h7V0qKA+KpZIbX/ljWu/G3cZJCeiMB0PHkWlslyZ5jZP8bGGVoa/xSEpgSAAoJGBXsmmyAhoNCMtoLEePDwzKCDgAPCAAAABDdXcwonv9WYNUC4bjfjCAIA3jrCItSD/9rWO+OuAbrOP4g3GUvuzoc1rWhpTx0MnhtzonmcG9vHORi4hkBB11VMXkYAFeJXavkPzMNkyN6045XLYVwQkjLCgs7fZGq5FGBtnXEIvYW8ECorfjFVhSwAK1CZYpLPpZxEQSXWmQG/NnbV+kw9bjmEmMgu0z0CwinBq1aUd7GHn6IBDxjY/RTDiL/+op3RlTGIXw2u19dC9dofgnDgWJW9Fzv1DliUpz3qC/B5E/ocXNRMC81BGCFBPO8ykaCJAtdUXB1bGs4zSy5PxSECOfgl51lvjCXeroo8UgYI3wdyKDLzwzRzXwl3gzq9An67ZcRsTXvvHXwYTqO2qfm1EXfM2249gpQKzChomtEI8iHjuTokAroGax7mTM6waZQMteEx97ALeVp94fvwjY6Kk1z7QiVv1Afhf7eJkzWrHp1z6HDN4kkwG8fMlqgDl9RUMiArCwhIBkMxzM9nMrRT2tEeC1TKJwqCtf5pZOe2ojPHIY4f1nMqYceBXkMy4o8T2Au8gzik6Q7ai+RIHG+8FIPG751FCe5XEyP8oC0zJ7ETCiyBxvhUXE21V0O8Ew/t8BHK3ZIDvXJRbdg1a8LTXOebCOVXIDa0ecl4J6l70v+CBEuhFEwB+y6Sq4TwyN0rUc2LM941bAHG+OF5/5A3Iu0ED+MR4Ktz6sky/wfZdj7KX4Fr5TmK0xwnzw/1ruTFdEeSTUttcxk2FUKmYI5tdb/ORLa8M0c5VZ24rhvj+EfOVQXlQoofCL5bD961ag5cKj7oBuNaGfKFER5SVhzyUO47ytY7r5OmbRH0U4yn9LzcTzzuyErcFgSQ9zFB4UTw+Li08nQtwG2qQa3FUwjhzpFEJIMYtkf3wwV9/LfV7YbHoqpQmXttRCSdnEWqG/DeeAw5Wp7a3MM0cjgcwnKYdT5//McBNFlBB1+xX/Zbxw9C28DpJBkVa7IzVilJ2uqSAnE75LP7s5cDbPyPgYBFBNIDrlrDiAaAkKso/uwIQE3r21PId3lNisGF+ek1NIrak4cBtJTiX7uW83IHLGxeOTekf+Fqvz/5v1krxNnjz6+s4mZvDGd+07b60tVGHnGCY7/ek+3WlkVU+j2XNbAcJJxj4x3f2xFHgIoyyTCu1czQ/bVLOw6yIGW/yJQ0ltvmNP+5lh6BgkbekIMMVqiuMd0ZQct9kWJzKSMUVrJax9MPIDWD+PoOjGBtHDWfv15UKT0EcvvPJmoDSH1M3yrd9XNqwIVh/zhG0r/GWMxga7pggmyIp1DiieZpN1aOhZmVxtt7iehl+0dfjoKazPsBlO4g/1n++gZS1+FjtO6FHfrJ9dbZmBmI8uf8HXunYIDwfoh2lIAvXK8tCLMOUXt4aKEXrG+ufvaaRD0kMg1dQSgKpye4qgitwHSiUMsXsQgVupz1SYEPoIr9hAkQ0QP9NCcXtpbifZx8te7/GwBMTe5wfIjG+RD+OvPtbMxC993KF6/UAi68KBNoIe3OkL+osKRQXmfLR96J3UC5LQjgjgwolqp6ZyMUSvn41fa/gi6jAWOLlQv526JhS4jMJuvGx+fQJc2VUus8QYCQh0VtkenIafdeTDPwkCkZ8N8AmBzhOulHKO3necwagT9GnudIkFHIZ6U5ubbvEAjyT3j+6ipuTe+23WB7X8WtUQZF0SkmVdruIkAWWkLo8+65cV/IWokkQy0OawkBrb3RO3DKOGvxFUtul4TpvMmcWy8vWkia090aVd42uLkNn5CYdBsJo1qtYTyrUB4xT2eGQg4ga9qBmvaExu1nWRdoEuvzkeuKE9OcCw10WbIkXp1nVqP9nKeLcsePBtRu8nQZdL3PyRJFOcAScU65DTVOnDImpv7hKqMiw69/vFOksvYYkzrC1mEzYagnGVASCAHFhvIubB51onMKIi6cI3vxWFJi37cm5kb0RgZGoYD2XaHdD3EYs0duqsjSA==' },
    'charger_night.png': { size: [22.30, 78.75], at: [445.77, 287.84], href: 'data:image/avif;base64,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' },
    'charger_day_plugged.png': { size: [67.91, 100.43], at: [446.88, 288.33], href: 'data:image/avif;base64,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' },
    'charger_night_plugged.png': { size: [68.85, 102.99], at: [445.77, 287.84], href: 'data:image/avif;base64,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' },
    'charger_day_led.png': { size: [26.29, 41.29], at: [449.41, 286.14], href: 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAGGbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAAKyAAACvwACAAAAAQAAAa4AAAEEAAAAQmlpbmYAAAAAAAIAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAABppbmZlAgAAAAACAABhdjAxQWxwaGEAAAAAGmlyZWYAAAAAAAAADmF1eGwAAgABAAEAAADDaXBycAAAAJ1pcGNvAAAAFGlzcGUAAAAAAAAANQAAAFMAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAAA5waXhpAAAAAAEIAAAADGF2MUOBABwAAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAeaXBtYQAAAAAAAAACAAEEAQKDBAACBAEFhgcAAAPLbWRhdBIACgYYFbSkyqAy9wERoBxwiN4dQs/fZBMVCWRE311FXBGmIdlnq40RYQRljCOtELtMT0AITZHdCBeMIQHjHzoMd9qrH7FuHVEYB0nptS6HVxlAA0+qYgzPUv7FJetabJjJQxKSiskNOJGRiB5142gRA9PIhzm2A2fMSzoRqwfl6ueWFoNZwNC0iVHXHrBI3+6xo5NT/I1E1ECMZkqzMQ4JHzcCKQjoMobVnhwL89hORGerfqj+Zn0EpBLUVQAutC18DYobcqC2lk+gq0NjYuL/BZ2vNIcLxIyAQrQDoPGyyRbhrylugkgG9T6zb9gQcZsZPzrVe2TPYiFZ3SXt7FGAiPHiEgAKCRgVtKTZAQ0GhDKvBUR48PDMoAA8IAAAAEDdTGvxftnMZGqdGnQsSvTfDvFGDz7Kp3sdhGzE8egkrF3wkLefXVQ/VcjCETvSdvFgxVU+jLGhmK7beuYt8LvHl4G6nRqB2fbPgb95he2qPJ+2FAe3muFOgWV3ybbFjvrDHqpcyS5hgZITiF9vPbL8hG7cYyVy32qSr5bpk/kn7kRkVoguYTs/Wq9TDYAL6SusgVZB+MlzfDSt2ivj2pUQkeyvN4On9E4LetL3pdxCdvETL5sjB7qpLa1TKM0xoTUlX0tnblQ0p/XCQ56Vpd9gdNrQQiclJuzUXtxcFZ0eVwAOLxteHKN8iSGCLdSgLPbKiIRn3yTG9qkaohZJGsmwnN3+D063fLsWA/PlEtElas0OTKo5Vv9igLYyeSfhbCgQIj/fDKPLA4VsZW+hm5fIIdPmYlhgRraPW2KoSH0rKVsgadxgQ3tPZJInE22N/EdroqNh3zLF8GSTcT49KxYZhLCZl9bs4eS7Zg2AfrgS54vY7ohoMBUqZ5hddztWcGKkEIRPBCJsiJRpHWKP1KAL6CM2sSwnul3Qofvwh203c0oo9QxDhabU9s7vYkE8rwWwe+Uys1vxcOMU8Vx+CWITElbA6/WF7/jj+z8XIhJbU31L2GUzKAndYwplGH7i+vv1XPcJhJBK1+mn52Bt7yBvd8ybf70WEeDgsfzN2DSKDkR0gdocS2+scKWm6b+a52ASj0h2HlORbp/Q6XAgVVHx+o0MqnCttqMEVxlBEI769w4HIGnyoWj7gc76qsPsyQCVAlBKt279S8xHMhMyvn1OkAC6vUXPFQbQ7bPFM98G2TTb6bl18BF0GoQMt9UOHCzTFCe/FModSQAn9Lb9YsxVvEv0eQHWx4zPlsz4zrWju+leGsZbvCH39ozP+bJM7nteGA==' },
    'charger_night_led.png': { size: [26.38, 39.18], at: [448.48, 284.93], href: 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAGGbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAAK1AAACZwACAAAAAQAAAa4AAAEHAAAAQmlpbmYAAAAAAAIAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAABppbmZlAgAAAAACAABhdjAxQWxwaGEAAAAAGmlyZWYAAAAAAAAADmF1eGwAAgABAAEAAADDaXBycAAAAJ1pcGNvAAAAFGlzcGUAAAAAAAAANQAAAE4AAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAAA5waXhpAAAAAAEIAAAADGF2MUOBABwAAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAeaXBtYQAAAAAAAAACAAEEAQKDBAACBAEFhgcAAAN2bWRhdBIACgYYFbSayqAy+gERoABgiN08PwfKQUD1hMVHd6zmOu+miwntumt1eXExf3tJddSLg3IcugdTqvltyp/iLxFnYeMWk8kUWB4tUXE0dfrIV+4rkHb40F4BhkTC2dfC/4/6sG8n9QRCP+Zf1f7RlmeiAzs+45doiTB03EOavY45DXYmhoVp712KF+hpXC9Iw77qF/2iQ/4RgWTxt2PnagewSZi3WCadV5acSLMh6iq39Fmn4H7kmBczeMAIB+b0HNYrfdjfi+y8FHnvAr39rKLD/vdjFemjX0wWBGyVJweP+pJrkegXsb81Cj7L1lBOr6DFT6Zbq8wi4NE2xijIxJpWRYT2F5ncEgAKCRgVtJrZAQ0GhDLXBER48PDMoBAAA8IAAAAE3Uxr8mCjuKjEVS3iO/EDzX1Xvt3h71GwFF6tkXdAXHcIUcI0ViAr1d/IY9nRvUxORUzabMbdXAPQNW9AcmUU5Hmm+p0bTroR251umuJBe7o+kR/jlB5tai5qNrh1VODiwCAPBj1T8kUl3KF3Mz3d2T50c3fOEhm+5rLt8kekusjqWlKkMpYFsp+0ZNA/AW+c1KU7Pl0oaKws3rTHQG7aAS0SElFAAaLXKj+k0ihdCyTJZbdelL/3WKs1NkR+MGggioOwftBD+W+ifVF3mQD4WW95uUE/BLICCRMAyhFbqNF+msJcNWHBs3MbE4+3H9/UxjtPzIraLypfm6dbnBRhAXZPLwSt/6GOZzmpFCQN5pLixw833M/nn9PgT4qKQOw5lE5zq9x6kthI/7L3LcKUczeGXcfU898iQDYk2KZR5WQkAHGzSimkM46LkdIgwyBy6KOsnW8bKAQNej63aGF9sDCZ4LMEvNar4DhCU9+48SNVjU2AsW6yvN+lC8UIIflCUDvRR7PwYUSzfPfw/ApKCoj6POu7ysNw6ZDtMTA+Tg0jgcdOevsHVfxztHzaOmXAsNGabQrdVIpsBRlmNifNPLsmLbzpbT1e2UdmSHes0V4QvevsAJMDKtvRblwx4BmA2Bo28XHQCxX8zOddzM4CeO2QX9CRC089lFGHtxTFFl95Vg/okanEMcT4gbJBXpVJajgtVKGsJ0R5eTsjJhSHjvUqf9gkeHHqmKvD8zXgLrezl7j38YBpQgo+0ANRCEE4qX9FdxeUglAL' },
    'garage_day.png': { size: [207, 202], at: [419, 233], href: 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAGGbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAAJIAAAYjgACAAAAAQAAAa4AAACaAAAAQmlpbmYAAAAAAAIAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAABppbmZlAgAAAAACAABhdjAxQWxwaGEAAAAAGmlyZWYAAAAAAAAADmF1eGwAAgABAAEAAADDaXBycAAAAJ1pcGNvAAAAFGlzcGUAAAAAAAAAzwAAAMoAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAAA5waXhpAAAAAAEIAAAADGF2MUOBABwAAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAeaXBtYQAAAAAAAAACAAEEAQKDBAACBAEFhgcAABkwbWRhdBIACgYYHfOyWVQyjQEQ0AQQRN0zTCD25H8+fiPXJZ1K7S7eDbiPZa+vVmGx6QFrx9Ixaci9Qm4YNIdU+b1YBXPyW6gHypr6DrD/XFNKS/5V/TzDAvdnn15Nd/26+1DmA7vMKsgliF6rGPDEQjStdXzJpevTjSsAUpmFDZmeVClCv1zGNY0koZXOBZTPCJ88mBYKMo1YMhVHc0gSAAoKGB3zslsgIaDQgDL9MBDx4eGZQSKGN4QAAAAI3UBM+qAI7zNf5n/sqewlJGuPpGhyYqFLu6D/CJhvi2dyYpAAdzLU2SnkVawHfNLH2lMrYyfbwOkJ3wdytRlKMFfiflnroE+nDwaBGTqlPe8ABFJq795mCLOy7x/BnnEhNlxna43JX+hPNzBg/2+7MhVW5p2FF9/Ipwg1O9khITAA6rYOxbwIDqQuoq84CgXHA1h5w3yAU/wGXV0tbLpLyvTc1ebxeBqeqibKe206UQU/DaUW5+lQTVRTAXDdn6RMnvia/KBBtqQdCEn3CNDZuJCVmpl4tyLUQKToXTc+Dr2zajoekB60weWapoU9L+fwxfLfEUiDxkYV/sogGElGHnEs5S3jV9RvmqDV317KNGqNWpmmgfAzjsNhxyygTlDP44ooMdYgE2PAWZyfGAYussrFSorWiG/3I23nRNToCoD+9ObPcHhNEB8ELtlts6ZtWhMQUlNv8KwDR80CgV1YCkHN+b8jDSWjp7zOe8lmZ4cGzt7E/ry+r5dJl4ENBf8A87Oqi1YKEtCF++1YfKI2ZFrlUm/v0QIxrzg1eVNfvg/kyHPg9/p40TKI4cc8dJuqI2IKtU9IKCpemXL6MHNSCDtLW6B2d26TEs3iT/IkU0byZdb2GyVeTRO8++aUnwPSRtXu75DkbdX1/FEc7uTaE/ZhIiDB1F0nS1jPYENebSI43fK/2+z7x51x2UV1uUG5bl9e/BmVvCsns739cXRwhmLXYUbz1qJmtu66RCY22cdXV5jp9LfC03TVgTVu4SO8rZ7woFGP1YuAqukJyOl02wNSnuEFYuD+jMEbToTiM+ixTqrJV26n9zJVsULbRGxUSRPLme/L94thkpjC/PYZ8rMoaGBELC80R+Zlx7ApWSgP+spc2NJZiwkamMW1tvE2nZ+hQVWRDQ/4XzKJoKyNz1sY1PcQu7CTP3xvMLq4LFdJYPMuk68eq+pJu9bEnuYfRdTpKTzw1gCKl1Zi9GuzMANGK1luS8FORmRGmHlkubWeOJ4m6TgXJ4pXcAWpibVg8+989pjMyoc+9ZcG+/8OEScOn+oo1JWzTSqceM9q27KSWZdNiMmFPGnXLGGoFcgC//s3y7fIdZbnGMJB4479t6jL4BDMlVXgtToLNEXtXfZ0maZ6jFGWAmwrqBg49rq4eBZim9qMNTQXP4Hl8TIB12ksMTxJ1feMrNCBQbrM17IMxUxQX+RN7VPKPPr0PX9awJ9apQj+yq24pXh8V1gc5Lg4pgJ+iSnq/c9F4X5sH9yFi3/9izygsATDXmdCX7NPIo3DcSZjnLwkE2l1OgT/2qsQZXWQS4KtU7Mzy1G8Dr6imDYpRgu7y5PMf2AqSrqGu7a7aTIO+NJthsCoxUwTfe/xuR8XTkfImWQj71Z+LXvUw13bnjoASJLiFGJ+SmKa2rG180B7xn/8p7bcWDMX/3viNJLufIt49eGC+/p7JcCGrLEY9hAE+qslEc8Lwsb2zXc80+5T2Am8XgOhS2Af52GAALBZsJdakmd87tVHwhthIcq3fL65KGH8ew2VcxEARB/iGpoEvvoz88n/MbszREKi1SpwtT+Rycg7SXinLSKEeCiBlt71MPMa6rkGG6yyOiEK0iEWqRw24aN/ZuAaWyFK9aD6dcGZAZ283nOWBSFFwojfp/1UXzsnFTqgmstStJaW5fc8UGJ6y1zEMI6OaHd2zzON9/e+8FOKyqFa8XYsVcgCNqYHOpoCscKkgUJG4evLK3EdFAZ5DVnM9O+M+DmEbF9ttrT7flj6SVZB5zJzWTB0aNOuKK0SveXvH/eJpOgfvzj62t2MRpD6MS+5I4MraBYU6EI4QSAq/KypWCWNQViTvTiSHDqnKaRqPRc0vWdof0PXmH9SNRuhDbbRCGWiotsK63pFMt3NTa9iE6Yb9fPT2JUNpVFauI3FkZGAHgCmrQWObV8443D53fGg8UoN0okfZQf5pY8fW/wLWaTUdRtcEgWjz4Dk506vZnNNks4KG0gYmbcwy+ohOYoSUnQggD4sjfjnvLBNoDl2Hoj2D+vsUUAgWnKhLdar59kZkGPb5GusftnYk2pNUhRJ/tyThli83XhFp4nDO0pVjhOmw1VeimlfLYhF/ARihjfKL31tdlKzBhFQE0ySyRAmJvs2OEQEgn5Dawp7884U6a/NfgVBSaVaz4yI6e9jxlVuKseJUq8k9ovzaEk5Xg2nuWfmlcID4SXtJbHUkpmaP60TL9Hh41G8PGM68PYIPVjhJNuWm1lVFHc9byl9ifgx2FhAc/pHuL/KCDpByD33JePHEadWqcf5YAtvrdP49VUaDu09JS46lFx6xXAsaSRfJUBfw92MRSo/1vOIiHcZRHU4iJQeLdH2gp6rmrwjG4FhsV+JfqR7yDByYz6TY74bYASWt5203lI/jcVOI94fhTJ0L0s38r1dmSWWkRdAoDaYBLqwPDYgwQFfaWHK90l0QD0+TdyqDwZrrGI0815TaYfhU6eccSpbrEUwa4T47NNFmUrVCS46J3aKbhIseDbtrM8umbo0arFhi+NFSOsqiQTJZj15e2SvbP7ZriwGIHbw8NL9LKUJlYlsp6s10uG5nNjMXJvxTBLcR5g/apV/LlWPPTEalCj4SanrgQi71vXwbRtHRL6Th3l3Lf9q4MEyrTI5RHiZK8oF3pUfTVZVzkv5hDhKPCxbmuKpiREHtr+4T0NEIHsZHgGx36YuEl4HTleTutM9S4L9AfK0flFg8JZYvGOvL2OAhWHcGZ3VN7sZxRVtHcGIGCGtM0ggUyPE3HCe1KvHB1UJJJOSbrOdGxjLUBAIm5pUazB5HnaH2at/7VbIA1UDkmxrvMA/MyTfMqn5uvMNfAUiCO5VpJJ+g/sSH5ccPWOxM0j2NfkDrTuxzVMG6cwPxnXIIUiB4XLnMJuefiD+toaqlfLScXW+LZC0HWWLc/X4qA7F1KIXwy2LaTJck5tvaTmg3cNZeB/zYy8UzYVZ3Cliw5205837Rm9/ZmIHq3a3NVbOGjs7SlWUj4MJY3GrRumteYRisHyWZeWwdoP7ibxKU3S7N77ySw0whibPIZ9dzAHIyOmOgp+l3qBpnw5baHGHhJqP/TjgcKdklhRPW4wqvCz4RXIJFT9wrMCpJ6dHniLMPoJgktk8hlkUdEFje6qmIfixRxNda/gE3HiHIG2bytEhrb+wNb4siPCKVggGjywrWNpXDYitlQ+i30WINkM5EqnU7M4EWgDUZHGaN6VyttHWRPQg7cYfbmcjnZUCIbEr3mmnQGon8YyLr+UJisX6bUixlM+AekvwhMYeGkrnydA2aNH3jOLeOoJbd8cXTs0SB1Hkqd5F8Jv/5za3rUJTr9uWOgEt42NaMXnDvIO0b9B4p76uPn1xl37ilMI7OWGrpkfRaMS6+rxtIAR5LhZ6wOR7BrHDUCvJdkk7nlgh7TeOLnWLsMh4OQC6IrLdSPB/93muqdHaQd4Puh9EmftNl3h2CrPT6sey6clVex5tVVi+aHYmlLg5WX7ikgtAXXtQC9eQ7mK/N40QvF59GdwBWQsio05pImrY+/IxYasGyzIxPZkBVaChFF0IMf03gYYPZgZFD+9iiqNfRL7rCGW9SDakBWi5da5rFnlKA1uPiFjXVNvw7a7qrjIbGjN2BfTf80rToGmJtS8uqFKOWYul0aIuLjwiirq654eiOu1uXctuZSEWkXnXKvMrzx3wRtMLjoryWDNc1Nu2ptM5y3peAKVmap54iMumLG44O/vKVut7c6Db13vEa53zl4b/bt4o1uVbZG8nlnkOky5GTV49U3DiyTpruNFCZT90OIWSrktLc6Oy/1D0SRi334Ovm12VTp/8Rr7RtyG3VHP/hrVKnF0iwvvCB1INZJ1PCxakcy7jTZUO0QZxokcFIuEkufkVNKEJWpXV1nrS37vU8ahh+25CtE5kfah2y4ZeaA4P7Qyawyj5Kza3CICwAIvQ5fVUG5hLddirKiaNqVQJLa3cc6COwMT194K4yyDtZvoF7ricoRPmpGj7Dade0uuSfwad6/RzpwXAH2Kdt9y5YRXh6renyTRx35lQJTUQIFkWn41GGXph1xspDOrJ+ieRqB0zrG1LzEEg4zOGg0/OGu03w1aXqlDAxA0MTlnrDv3wzOxc+F7Fu9eiFzFICao/eJ7IME23/SuCFaBFHDkUig29ztDswmSv61Q86QWCNAF4WGyLB1yn5lp8NYZLKjino1yEPUL0LfAB+kf6g9nGuHs7Wc3WyvU5l43hs0rGyhnDQDd0gBqGmv0i09v0H/2y9On0waIeQ3kWfAokH93AW2/Pts5AFIWoPMeGoc4+0vJL7K7T+nwEYMmPRj+Tu0nOINjGs/NaInT6+7AcfjEQ1A+ioS3BvHfkyawvcyIl4LXy0O/S7TzX843yoTy0zvwfxkw1U6PT20SGdYhZYiiiX45GkqzD0QJUhLia7Oi2ERNL6lN34RmIEvhx5rDeohdAk/zyiis9Y892Q6FqokaAZkLCmVCp7DOmJ8H5Svfj6CvYQBKl++mK6f4PW4qTI64ClVwgFX7TM8sfoEaEZ7SqAgVR5jL/x/0IkWXKQE0H1bWkAycbzpATgsWX0X1RV+0jlH0oT2q/P56HEuLx9UOw3vsBFy4KltWkW6GZvPHPxwbDSAOxMldgvwYmrfbmwED8JBQzRhIlG5AjGGnY2XGtS8V1N1Oxv+GC71d8Ov2Di1gJH5U9NUJQQOo+uq0dxkuHgbZ8u3GpKeyaFpJj3X12uzWy2MHobD6cZ9/DCfkiJ+aF1/pO2Y3muaT7dZP4Bh4n/7Fkx8Om39DPZmCRnyyWa5vznfaPNE+UW14rcn1/3P83329fviIPTJBg4Tw4vxfphcGfNQeKtqI0BL2mfjbP8/9wYThJmJfUHbXyFxzPo+uXMU3L4d+vvOCE0Gh1SZ/vhL0xVKBvU+3D+QgaPDejSg2UPRz+LRp9FdBtqkQAVGrwuw8NaR4Ihjd/mVYx/APl9R6+kuY22xH8uoeJWTQsogAgagf0BL03TG0g9v17DoPAa9i4BYybSWXVGElSGMoT7zivBIYZuzJDrbquWgu6BIgnRWlLnspgK4+lQO9kEEa+XXd+ZeQL0efr4ZaRAOcSLs8AaDqquuQM6Ef7iDNWs7q+ptWwfU2gJKY5YAuEvXdboTeiDUSn6Y3areuQ7qQqFADANLwoTstXCX839ET749R5P2xnSEx8yNgjni41hp5n1Xk5Iz6uHO1M99l9V11UZBfoYce2JSM6NpUf7H5sxCoCYBNpy3mvMOS8d0crcsJDBpwC1VJoeybVEM09KkGUSj98dNBKWEVT3Y24k7WuFNMoBcI+ETjtFKqIUUunNmGJSZeQBrStEPZGq772MpSp312jkc8H6557QHoK4aF2YFDIF+zI27NDZ44XT1b/NdPsTFMObhLNjcmw0rkMe1edV1Ekwa3YVyYpu0uVV9URB92lbMYcZKor/DbWKE1SvhTGX+WWqHMTf4rHTTHBvgCNDCXE5etHJYvukf7YrNDyfUS8IKf3A4ipZeyMogJHXhvTH0SY/k7EOS5V9z5YkF16A8rCbbg7kNiLMKgSi6piWmj+eJ1tkJBF1uFWhCJewRLCgqPyEiucNEAa5NcBsAdrbYXqaflKo0MPH9Qj8gvmSTRH6Nlm6nn1wbgGolVCksEEMZRKJ8OhRQI8s4pLHt5dcVSqRzK+7a9wheSvR3iOZIUsBlGeXCFIuldlgZkACGQaRCj4Y2qQc6zK1BDiygsWwj3VphE83wLj4kEbN2+iF+20uaW9zNgMVIvMPyfjold8ncEOF19ViezphKMGJotYGBBqhEH/hhlOUcjNgUzeph4g2kFOWPSL01BG1RGfPIvBPJZnSJgrMeBwv/3hbp48cxdD0IDdi1XhP7QdH5CBwMRep53jJuawyRVwbTRQtuJYsGpDSXeE0kdgHChXwsqICrIx8jIwMWgXhEXMbSWRb33O09xSEXZnr8hbiLmPZG3bY+c8D6q+WbmvhweF/+G6nmd+XG1MJjZ//AAfH/NinnFOWbpglJpuFrcF4DjUDMqQvh/aovzkpJxjmgRr8BSTzY7dOQeBQkcbZK9Q95qwM45BHGjpkPaS8orKEhVNB5AXWYPanD5Y4CBWYdLcDqcymBqzcgVmWOH++pzSrGqEWCqlDFVfHhPQtSrIpLQ3G2As3kM/RtZtgB+4L+3cjDkwGC3uWAN81q5l4gszK/CV/bAwWqe2zqXmjizOopOkQ0XfZDMBS6bIQhSxHtGbBclvZXzd4+66uDjhe3BVLorrF74j+ipzqWJ6uW+ZXgzvmCOpyGj4faFLwuVON/QfrwQjxcwoENGKpgpBymPS3VRjdGfUXqKSTtiSYyOdXUQIb8gY1cO+mr3TL1YH7YHiEkfsgKQMBM6MeH1rtiXbsY69YRxaC8am9O4uF6yZuFO6b3Zk4LYfP0G2iA5W0DUGbIEyDMWHvf/rtU/5+Odn7Y+ZVxkypAJrzvLJjDqQTPUJd5/iv3lET2HQB93JLrhCpDdDJwV+4+LEGACRcVuQg/F6aSWIzkKpA0N1UqsecohIxWkOfU0LmmAufKRw8WYxBlJI/Q9jY/nbEXoY2mP17fC4Qgae9k1sjyHPNZ72Oq5tmasEzWo541/Ss8S0FwL7SpahAQrOe6HlgeVA88K3dQDzLPADUteaHkLmlTrMyg+gZ88VrOPHcS/vyD2eLnzGrattQbsx7MzBSXb/SqMVDO8YOpos3FLnVUFaZamQFTnXJHOTlwajsS0z6NrqjtEbJdYnxGAGNNgSAkVpA1IlI37heqkMUHZi/SJcQ+siEdG9Dwod3r8e2qc4D5tqIIHmCQS4WtmwXoK8S3+8SY+40KJBHCIx7fjDY16euSBUCaxekTmroKE0IOHcUmsl1Uq2iSNEeEaGxUDaLky89WpnU5jaqbl76rCT7ZeV5bZnhv41qo6IBn8Gla+RZR8iRcrK66+e3n/8mzxTw5x8JRmirpAP00WlY7G9QKtwbfP5Wwy1CewAHEjFOtABc2hudvFT7J/dv0IMeEBmnLXhaIqi5o05Pqkh61ykenWYqJMmIKoSJULYH8M0PQF67/5HXAVhDzZ0XcobOyL2jrwf0JtTZcpZpkWiBrMgMb5kd3cr83+2PDm/vH6UaUEMwIYePpgMo3F1T+L8s04JMmJWaV8esVgk7ZAeFuCi5OwJgzgJkitx1HC4Mb6u1g926r/BA9+rwR9rZHf4lVMjLLpFd0YPWRkf3Ei9a3q8+qqM/Lj58JY7ghQDtZgL07iECqC6CFPBh5uANk8kCxEDWU4SGGRbJZ4LUxoyUmzOMVGYrWalN4cBUNZvFMxvhEy+1OsUvSzNeXbCGNjUYgMhZy2WDJ/mHzp0Tp1mmJWhLE7pShacM317F2x4WwcEH+xIecfInOLJuEVKOCaZsC2WWNxTtwo3x7YHgQA9VDxIPyTqMYkD4FeGR65s0sn5JMhLu4lNyAbAXrdXzpcJEomLjSUsagJZH4v/VyuuX23Sgdf1Nnd2eQEf5iMIMAeSAL3DSbaeXzA4/ZZZutXZy5uS5ssDcNAxIC55QdljuYSTZ4t28ke74Bn9Cp+cyTxdxPiL2oG8HdJTtsXV/62XNKN1xSOkv1KQHvjfh3dMHjeKFVUY9zFLK22dbYjfXfciYn2o4JNW6wMLtRILjIyhHNKTJOkP/NmMdHNIbEGsQ2RBKfs1b7gCM1lXBeFIkluFGOFnxsEsF8m+MUsPBflaFd2S61NahX8lp2BQqr5s16X3bApZMoBtsv0TzobcxqZevEGLp/VoZNkNYS2V6u6cqyhKpTgnYeX/8NQTE900jgTq0xObZhKIM7AQBdiPG4FdRAn2mqEDIv0wU3rG9nKE8kCHQVsSmUujJ/4lgfLgjSB2W3N30s1jDKsPGxeO9H54MFDFa1N7WoBbKCwjr14yV42VxYDYUaGrc1Y5IGW6bvSWq5gkpNbY8lOfTZgJBMdxFgHLG31a2CoWaKPX5sPt3CaOyqDR1fJiz+T91Jj9dV3W+SipAz1Ti9kxTrQd69njKbZLAYvFeHhBaNSaQXtJG4gGskPWAYFplsG+S1FF50Ol7FVf0hez3rIiBySoALlpt35i6WQvyIkJzm89bV8Al1h53vjyuaZ2OnKvFS1v9D1V2Y0m4L/D52iM6S3FAP3dewrsOZFCrgKbLcEHolmHTmpJ1iiLK95/QNZT+QrVglt5iIUyDta1+fd7upVI7pX7kZ46EiKYqwGrUBw56KSmmsYvl4V1ne0zYtVNM+9NSiDwRaPj+kyDH8C+XlMi9v9S5hadplTVETmnIvnaysc6K6JCwodWuj7bREw/T6iiVrmQLgCk' },
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
