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
// keeping the text inside the protected range at the narrowest width (wide [640,1240], narrow [580,1240]).
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
    'house_day.png': { size: [1676, 873], href: 'data:image/avif;base64,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' },
    'house_night.png': { size: [1676, 873], href: 'data:image/avif;base64,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' },
    'charger_day.png': { size: [22.41, 77.35], at: [446.88, 288.33], href: 'data:image/avif;base64,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' },
    'charger_night.png': { size: [22.30, 78.75], at: [445.77, 287.84], href: 'data:image/avif;base64,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' },
    'charger_day_plugged.png': { size: [67.91, 100.43], at: [446.88, 288.33], href: 'data:image/avif;base64,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' },
    'charger_night_plugged.png': { size: [68.85, 102.99], at: [445.77, 287.84], href: 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAGGbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAATcAAAFSAACAAAAAQAAAa4AAAMuAAAAQmlpbmYAAAAAAAIAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAABppbmZlAgAAAAACAABhdjAxQWxwaGEAAAAAGmlyZWYAAAAAAAAADmF1eGwAAgABAAEAAADDaXBycAAAAJ1pcGNvAAAAFGlzcGUAAAAAAAAAigAAAM4AAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAAA5waXhpAAAAAAEIAAAADGF2MUOBABwAAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAeaXBtYQAAAAAAAAACAAEEAQKDBAACBAEFhgcAAAh+bWRhdBIACgYYHeJzWVQyoQYQ0AAMRN0+LkxpLiY/7cOwLyfDpGAUZNqXkZakd34zKKjER3R4udOL2esCiGTLp8GcIWZ9cmICfPGPmntxYIbwZqsIDU2WEC3TlH9mF4X80Nv0U7WUlm8cfkR22TB48GDcm533SK8o1ZPZfT0+GwhvnHwGbpUsSEQCEH76bncK/7KdkPlZi7OTPWgwWKInDJQWAH1ID3vwKl73U34qLpLr2iK6pIT24AAltSzWovxg+faM8FCfXatYuguvqJBLpSp0spjZZ5PjT4lstjFXrqPfUeIM4k0jHKvauV3Y9b3PYlGNnrd1N+enz+q2zUNbdpquF2sPv504D/nq/T5dsB99vu7jDtNt693yFUY0uMJv9N3FXaDAxhCSPoVP1T/DaOsEenjphiiZJn5AQZNSujt/SFi5pYWZ54d3enKZH5WB4RMaIVp+W6s4yIsll1DohQSvqOl8N3x1a/HDokm6gfvmP2xn6EmLF6sYp5zCkQVHVhA4II56bApwBN0XyYZuCR5ieWdN4V6nojDAo8BUeGxu5LkvKfmeizEfPMafv1i1OjGOz6w7jvTXvl1gzGs2Ut+ZOsWteLyWLE8j3+nmaox/DPlpQW2U1cjILrWueIqRoBcHCJKYW9wNK5+Sdl0NjWBKqV+4Dyp7tsUEWybHjcoaL9us9p7v5WidsFNK/bKjt+2qDGck9D5y1ZPOfp58dnpkV5hSPPestEKKGFurYlwMBiy39bdSCqeaP9Y+h99ZAxhB6zdDvlaLQhV4mxwHLPdF9rpYL+S7kb3h1e7XToBTJjbvYjfY0yejrwXscTFZKcBGcQA8/Z5mUkFRroDkJJo7JixPgk5ZNRvvKwB5AU5aKlGiNwtVITdATZCixlbHTNO5w6ozrwNBvEeH6OvEefrSq55ktmuDMnx710TdzVb+Wj3TA3YXFl05WSd2XSQysvYCBMxN57gojTskSzShDyA243H8PUdQXQZ4cV3Pt998i5csB/Mp+X0f7HkRLVrEMeRjezF1EyOEkRyblH165ZE+c5/68ZhzgsMJHtYsT+UL7DlMhQfyhXFk14MsUpCdMUASAAoKGB3ic1sgIaDQgDK3ChDx4eGZQMSEB4QAAAAI3TgE7tI+I11bV9ysOJA/57P+brzuRXPwXusC6sGp2ycobua0QNofGv7AGMi7O+qWxRgDjUyjVWUDRaSqnT700loo4ACxztW6CLebjn5EFr319GCYOdFDYUJMXyUku3kPFNurYLedIQ2xBYtqIN9sfIs69PidogZ52sSzivjn5U64SGqsZVjirv7YAVXgRQxDMGGwdzrJNsL+mfmWHCczVJSpkhOaF0phiUO6BFgpwPmUAGCm+NyG1vmH5XIdeXEUS4SSck1yI4DVtM5vVdFRZJwOGI+6JMqW8VlSCq5GO4I96qJWqMD1WaVAjM4lmvH9IYqzGgLtVmrqK6215vsvelyZrwL0nAWU3cqnQ6UeQiKbx3uqJQyNEw7ESCRf3EtHQB+0OfOwCRZy385I61yGy/xzs8/6Lk+Ezscw71pjaMkVguCu1CXyIcEvotZnC7O1J/LJ6SdQEjvFL0zeM3AVb2HVyL0cYOk5B/d3baEu5opzApZUmvoZA/YlCysmlls0eHrzm4KhOL1tw9ga4h6aohMpIw0ctgmdUB6418qRuNCAwY6AzR5AhaBaQ46UUITJx1mizFUxpWuFnnMQTAdN+zTSEOvntp8oRHGzKExQD6vraY9VsR6P7sL4nFfBd+nFJKy05+Tg8JdaoCcvZ6Rm6sTtXf1BVSb0kxqzHFFhNE1RbZWFSkiPqyqNKoDVUBMYDDwO7sFmo33h0ME+18Y6Ci4D/IK/ma3SkXZsG8eGHI3DrlwIVExau91dsQkmGVeVi2kyxNKy0h89actScRPVGsWc6dzRYjAjac9zFPiMmMVlrevChBeNH/Djcv5y6L+1qZJrIxHhZOAixo8NvqX/1DxAaxDldtWh3uh1TfaX2MCmCfUMaAL9FRh6YbJh0PYUr6vH/x8thgMQLWh5LnyEIb2Uh20sYRsqzOoJr1r+/BIGchDglymPF82Wju05GsQzpyyjK+A+CWvEa0MnlPOsjFSQC0Bkb4iRsest6NDm/Hc5V7gygMZQeo8sayOaR8eZa1yus/YqK+PaBJSdzmByjLZpNlSMSmC09pFzUWgnbmHM40SZEm3+nxegDY2CvXxzqkW+kbz8DoiV0wWfrMhvbUa0HHICY+aAW54sA+xIacZAgV4dT4OHRSn1mlmNIQqLoDJnRb3rJmZZomAchKPbPr4HmGN/KrdxPh4qI3XozHxRUcH279Ad08zOdEeUV1z+sq9918BApaDAUWGd3yDCTlIpJLLyt9/4CXQSMRAeteFXv/FCyJYxpISfJjG7yS8YNonDEg9Bq+1MJAxrKoymMKmc5JLgIZxMcQCPjYqsx5F7cda0QSK5EOe7A4/EdYW7EmwfiOtrBLD8vFsRAztJORtdqMIbhGpbxbh0F5Q8K40kZ8XfF3AxwE46tAW+m7RsKVK9yQaLu/ATFMJ1jqX6A4HHFQO75PgncxJckMUpO94qdPBiOF/AOLuDF1GJbCW+OcWuokC2CmgXRIgiRysaBIxthjSYqjDMfu+5MWwzvlQqw+8w+WSFgSanAmhCOfZhh06j7I4ulBC8/OjJL0KEFFQQONUg9UGLEmtQDHR9H+cdgfhsiZy5XG0ovZF4xTcnCPA4q+MjNPFHe/FY9NvKCtCwy5gp9f8LHuB9kBJqzDUrgbi65qH3yBz46dWMIFlujDRj5p9CIi6PcmI77g6ZoY5W9WKvJP3T6rUfONq886oBkA5kjDRBw2QdebK+g+hhlPFqPFlg53gBlq5ez4LA1E8NvoisdTRMqA==' },
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
