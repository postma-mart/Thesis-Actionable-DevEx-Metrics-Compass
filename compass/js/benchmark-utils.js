const COHORT_FIELD_MAP = Object.freeze({
    teamScale: 'cohort_orgSize',
    productContext: 'cohort_productContext',
    goal: 'cohort_goal',
    techLevel: 'cohort_techLevel',
    teamIntrusion: 'cohort_teamIntrusion',
    bandwidth: 'cohort_bandwidth',
    friction: 'cohort_friction'
});

const COHORT_VALUE_MAP = Object.freeze({
    cohort_orgSize: {
        Small: '1-50',
        'Mid-size': '51-250',
        Enterprise: '251-500'
    },
    cohort_bandwidth: {
        Minimal: 'Minimal (8h)',
        Moderate: 'Moderate (24h)',
        Dedicated: 'Dedicated (40h+)',
        'Minimal (8h/month)': 'Minimal (8h)',
        'Moderate (16h/month)': 'Moderate (24h)',
        'Dedicated (40+h/month)': 'Dedicated (40h+)'
    }
});

function mapProfileToCohortFields(profile = {}) {
    return Object.entries(COHORT_FIELD_MAP).reduce((mapped, [wizardKey, cohortKey]) => {
        const value = profile[wizardKey] !== undefined ? profile[wizardKey] : profile[cohortKey];
        if (value !== undefined) {
            const valueMap = COHORT_VALUE_MAP[cohortKey];
            mapped[cohortKey] = valueMap && valueMap[value] ? valueMap[value] : value;
        }
        return mapped;
    }, {});
}

function getCohortFieldKey(key) {
    return COHORT_FIELD_MAP[key] ||
        Object.values(COHORT_FIELD_MAP).find(cohortKey => cohortKey === `cohort_${key}`);
}

window.COHORT_FIELD_MAP = COHORT_FIELD_MAP;
window.COHORT_VALUE_MAP = COHORT_VALUE_MAP;
window.getCohortFieldKey = getCohortFieldKey;
window.mapProfileToCohortFields = mapProfileToCohortFields;

/**
 * Calculates the adoption benchmark percentage using a tiered fallback approach to handle data sparsity.
 * 
 * @param {Object} userProfile - wizard profile answers or cohort field values
 * @param {Number} metricId - The ID of the metric to check (e.g., 14 for Deployment Frequency)
 * @param {Array} mockData - The array of historical user sessions from mock_cohort_data.json
 * @returns {Object} { percentage, tier, label }
 */
function calculateBenchmark(userProfile, metricId, mockData) {
    const profile = mapProfileToCohortFields(userProfile);
    const orgSizeField = getCohortFieldKey('teamScale');
    const productContextField = getCohortFieldKey('productContext');
    const goalField = getCohortFieldKey('goal');
    // TIER 1: Hyper-Specific (Match all 3 dimensions)
    const tier1Cohort = mockData.filter(user => 
        user[orgSizeField] === profile[orgSizeField] &&
        user[productContextField] === profile[productContextField] &&
        user[goalField] === profile[goalField]
    );

    if (tier1Cohort.length >= 10) {
        const tracked = tier1Cohort.filter(u => u.selected_metric_ids.includes(metricId)).length;
        const percentage = Math.round((tracked / tier1Cohort.length) * 100);
        return {
            percentage,
            tier: 1,
            label: `Tracked by ${percentage}% of matching profiles in the DevEx Compass dataset (${profile[orgSizeField]} ${profile[productContextField]} teams focused on ${profile[goalField]})`
        };
    }

    // TIER 2: Architectural Core (Match Product Context only)
    const tier2Cohort = mockData.filter(user => 
        user[productContextField] === profile[productContextField]
    );

    if (tier2Cohort.length >= 10) {
        const tracked = tier2Cohort.filter(u => u.selected_metric_ids.includes(metricId)).length;
        const percentage = Math.round((tracked / tier2Cohort.length) * 100);
        return {
            percentage,
            tier: 2,
            label: `Tracked by ${percentage}% of matching profiles in the DevEx Compass dataset (${profile[productContextField]} teams)`
        };
    }

    // TIER 3: Global Average (Safety Net)
    // If even Tier 2 has < 10 users, use the entire database.
    const trackedGlobal = mockData.filter(u => u.selected_metric_ids.includes(metricId)).length;
    // Prevent division by zero if mockData is completely empty for some reason
    const percentageGlobal = mockData.length > 0 ? Math.round((trackedGlobal / mockData.length) * 100) : 0;
    
    return {
        percentage: percentageGlobal,
        tier: 3,
        label: `Tracked by ${percentageGlobal}% of all profiles in the DevEx Compass dataset`
    };
}

window.calculateBenchmark = calculateBenchmark;