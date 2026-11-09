/**
 * Calculates the adoption benchmark percentage using a tiered fallback approach to handle data sparsity.
 * 
 * @param {Object} userProfile - { orgSize, productContext, goal }
 * @param {Number} metricId - The ID of the metric to check (e.g., 14 for Deployment Frequency)
 * @param {Array} mockData - The array of historical user sessions from mock_cohort_data.json
 * @returns {Object} { percentage, tier, label }
 */
function calculateBenchmark(userProfile, metricId, mockData) {
    // TIER 1: Hyper-Specific (Match all 3 dimensions)
    const tier1Cohort = mockData.filter(user => 
        user.cohort_orgSize === userProfile.orgSize &&
        user.cohort_productContext === userProfile.productContext &&
        user.cohort_goal === userProfile.goal
    );

    if (tier1Cohort.length >= 10) {
        const tracked = tier1Cohort.filter(u => u.selected_metric_ids.includes(metricId)).length;
        const percentage = Math.round((tracked / tier1Cohort.length) * 100);
        return {
            percentage,
            tier: 1,
            label: `Tracked by ${percentage}% of ${userProfile.orgSize} ${userProfile.productContext} teams focused on ${userProfile.goal}`
        };
    }

    // TIER 2: Architectural Core (Match Product Context only)
    const tier2Cohort = mockData.filter(user => 
        user.cohort_productContext === userProfile.productContext
    );

    if (tier2Cohort.length >= 10) {
        const tracked = tier2Cohort.filter(u => u.selected_metric_ids.includes(metricId)).length;
        const percentage = Math.round((tracked / tier2Cohort.length) * 100);
        return {
            percentage,
            tier: 2,
            label: `Tracked by ${percentage}% of ${userProfile.productContext} teams`
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
        label: `Tracked by ${percentageGlobal}% of all engineering teams`
    };
}

window.calculateBenchmark = calculateBenchmark;