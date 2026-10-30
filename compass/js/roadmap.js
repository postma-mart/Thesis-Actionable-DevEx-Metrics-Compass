// ─── Step 4: Wizard-generated 90-day roadmap ─────────────────────────────────

const ROADMAP_PHASES = [
    { label: 'Phase 1', days: 'Days 1-30' },
    { label: 'Phase 2', days: 'Days 31-60' },
    { label: 'Phase 3', days: 'Days 61-90' }
];
const ROADMAP_ESTIMATES = { easy: 2, moderate: 8, complex: 20, hard: 20 };
const ROADMAP_BUDGETS = { Minimal: 8, Moderate: 24, Dedicated: 40 };
let roadmapState = null;
let roadmapUnlocked = false;
let roadmapDragDropHandled = false;
let roadmapBacklogFilters = { type: 'all', score: 'all', difficulty: 'all' };

function roadmapDifficulty(metric) {
    const ease = String(metric.ease_of_collection || '').toLowerCase();
    return {
        label: ease === 'easy' ? 'E' : ease === 'moderate' ? 'M' : 'H',
        estimate: ROADMAP_ESTIMATES[ease] || 20,
        fullLabel: metric.ease_of_collection || 'Complex'
    };
}

function roadmapType(metric) {
    const type = String(metric.type || '').toLowerCase();
    return type === 'qualitative' || type === 'quantitative' ? type : '';
}

function roadmapBudget() {
    const bandwidth = contextProfilingState && contextProfilingState.answers.bandwidth;
    return ROADMAP_BUDGETS[bandwidth] || ROADMAP_BUDGETS.Moderate;
}

function roadmapCanFit(metric, phaseIndex, placements = roadmapState.placements) {
    const estimate = roadmapDifficulty(metric).estimate;
    const budget = roadmapState ? roadmapState.budget : roadmapBudget();
    const used = placements[phaseIndex]
        .filter(Boolean)
        .reduce((sum, item) => sum + roadmapDifficulty(item).estimate, 0);
    return used + estimate <= budget;
}

function initializeRoadmap() {
    const ranked = Array.isArray(contextRankingResults) ? contextRankingResults.map(item => item.metric) : [];
    const placements = ROADMAP_PHASES.map(() => ({ qualitative: null, quantitative: null }));
    const remaining = [...ranked];

    ROADMAP_PHASES.forEach((phase, phaseIndex) => {
        ['qualitative', 'quantitative'].forEach(type => {
            const candidateIndex = remaining.findIndex(metric =>
                roadmapType(metric) === type &&
                roadmapCanFit(metric, phaseIndex, placements.map(slots => Object.values(slots)))
            );
            if (candidateIndex >= 0) {
                placements[phaseIndex][type] = remaining.splice(candidateIndex, 1)[0];
            }
        });
    });

    roadmapState = {
        budget: roadmapBudget(),
        owners: ['', '', ''],
        metricOwners: {},
        provenance: Object.fromEntries(
            placements.flatMap(Object.values).filter(Boolean).map(metric => [metric.id, 'suggested'])
        ),
        placements,
        backlog: remaining
    };
    renderRoadmap();
}

function renderRoadmapCard(metric, expectedType = null) {
    const difficulty = roadmapDifficulty(metric);
    const provenance = roadmapState.provenance[metric.id] === 'manual' ? 'Manually Added' : 'Suggested';
    return `
        <article class="roadmap-card" draggable="true" data-roadmap-metric-id="${metric.id}">
            <div class="roadmap-card-heading">
                <strong class="roadmap-card-name">${escapeContextHtml(metric.name || 'Unnamed metric')}</strong>
                <span class="roadmap-card-score">(${metric.roadmapScore ?? 0})</span>
                <span class="roadmap-card-badge roadmap-card-badge--${difficulty.label.toLowerCase()}" title="${escapeContextHtml(difficulty.fullLabel)}">${difficulty.label}</span>
                <span class="roadmap-card-time">~${difficulty.estimate}h</span>
            </div>
            ${expectedType ? `<span class="roadmap-card-provenance roadmap-card-provenance--${provenance === 'Suggested' ? 'suggested' : 'manual'}">${provenance}</span>` : ''}
            ${expectedType ? `<label class="roadmap-card-owner">Metric Owner
                <input type="text" data-roadmap-metric-owner="${metric.id}" value="${escapeContextHtml(roadmapState.metricOwners[metric.id] || '')}" placeholder="Add owner">
            </label>` : ''}
        </article>
    `;
}

function roadmapFindMetric(metricId) {
    const all = [...roadmapState.backlog, ...roadmapState.placements.flatMap(Object.values).filter(Boolean)];
    return all.find(metric => String(metric.id) === String(metricId));
}

function roadmapLocation(metricId) {
    const backlogIndex = roadmapState.backlog.findIndex(metric => String(metric.id) === String(metricId));
    if (backlogIndex >= 0) return { area: 'backlog', index: backlogIndex };
    for (let phaseIndex = 0; phaseIndex < roadmapState.placements.length; phaseIndex += 1) {
        for (const type of ['qualitative', 'quantitative']) {
            if (roadmapState.placements[phaseIndex][type]?.id === Number(metricId)) {
                return { area: 'slot', phaseIndex, type };
            }
        }
    }
    return null;
}

function placeRoadmapMetric(metricId, phaseIndex, type) {
    const metric = roadmapFindMetric(metricId);
    const source = roadmapLocation(metricId);
    if (!metric || !source) return;

    const target = roadmapState.placements[phaseIndex][type];
    if (target && source.area === 'slot') {
        const projected = roadmapState.placements.map(slots => ({ ...slots }));
        projected[source.phaseIndex][source.type] = null;
        projected[phaseIndex][type] = null;
        roadmapState.placements[source.phaseIndex][source.type] = target;
        roadmapState.placements[phaseIndex][type] = metric;
    } else {
        const projected = roadmapState.placements.map(slots => ({ ...slots }));
        if (source.area === 'slot') projected[source.phaseIndex][source.type] = null;
        projected[phaseIndex][type] = null;
        if (target) roadmapState.backlog.push(target);
        if (source.area === 'backlog') roadmapState.backlog.splice(source.index, 1);
        else roadmapState.placements[source.phaseIndex][source.type] = null;
        roadmapState.placements[phaseIndex][type] = metric;
    }
    if (source.area === 'backlog') roadmapState.provenance[metric.id] = 'manual';
    roadmapState.backlog.sort(roadmapRankCompare);
    roadmapDragDropHandled = true;
    renderRoadmap();
}

function roadmapRankCompare(left, right) {
    return (right.roadmapScore || 0) - (left.roadmapScore || 0) ||
        String(left.name || '').localeCompare(String(right.name || ''));
}

function moveRoadmapToBacklog(metricId) {
    const source = roadmapLocation(metricId);
    if (!source || source.area !== 'slot') return;
    const metric = roadmapState.placements[source.phaseIndex][source.type];
    roadmapState.placements[source.phaseIndex][source.type] = null;
    roadmapState.backlog.push(metric);
    roadmapState.backlog.sort(roadmapRankCompare);
    roadmapDragDropHandled = true;
    renderRoadmap();
}

function renderRoadmap() {
    const view = document.getElementById('roadmap-view');
    const panel = document.getElementById('roadmap-panel');
    if (!view || !panel || !roadmapState) return;
    view.innerHTML = `
        <div class="roadmap-header">
            <div>
                <p class="roadmap-kicker">Wizard-generated plan</p>
                <h1>90-Day Roadmap</h1>
                <p>Balance the highest-ranked qualitative and quantitative metrics across three phases.</p>
            </div>
            <span class="roadmap-budget">${roadmapState.budget}h/mo available per phase</span>
        </div>
        <div class="roadmap-phases">
            ${ROADMAP_PHASES.map((phase, phaseIndex) => `
                <section class="roadmap-phase">
                    <header class="roadmap-phase-header">
                        <div><h2>${phase.label}</h2><span>${phase.days}</span></div>
                        <strong>${roadmapState.budget}h/mo</strong>
                    </header>
                    <label class="roadmap-owner">Phase Owner
                        <input type="text" data-roadmap-owner="${phaseIndex}" value="${escapeContextHtml(roadmapState.owners[phaseIndex])}" placeholder="Add owner">
                    </label>
                    <div class="roadmap-slot" data-roadmap-slot="${phaseIndex}:qualitative">
                        <span class="roadmap-slot-label">Qualitative</span>
                        ${roadmapState.placements[phaseIndex].qualitative ? renderRoadmapCard(roadmapState.placements[phaseIndex].qualitative, 'qualitative') : '<span class="roadmap-slot-empty">Drop a qualitative metric</span>'}
                    </div>
                    <div class="roadmap-slot" data-roadmap-slot="${phaseIndex}:quantitative">
                        <span class="roadmap-slot-label">Quantitative</span>
                        ${roadmapState.placements[phaseIndex].quantitative ? renderRoadmapCard(roadmapState.placements[phaseIndex].quantitative, 'quantitative') : '<span class="roadmap-slot-empty">Drop a quantitative metric</span>'}
                    </div>
                </section>
            `).join('')}
        </div>
        <section class="roadmap-statistics" aria-label="Roadmap statistics">
            ${renderRoadmapStatistics()}
            <button class="next-step-btn next-step-btn--secondary" id="roadmap-reset-btn" type="button">Reset to Suggested Roadmap</button>
        </section>
    `;
    const filteredBacklog = roadmapState.backlog.filter(roadmapBacklogMatches);
    panel.innerHTML = `
        <div class="controls-title">Backlog</div>
        <div class="filter-description">Ranked metrics that did not fit the first six slots.</div>
        <div class="roadmap-backlog-filters" aria-label="Backlog filters">
            <label>Type
                <select data-roadmap-filter="type">
                    <option value="all">All types</option>
                    <option value="qualitative">Qualitative</option>
                    <option value="quantitative">Quantitative</option>
                </select>
            </label>
            <label>Score
                <select data-roadmap-filter="score">
                    <option value="all">All scores</option>
                    <option value="90">90-100</option>
                    <option value="75">75-89</option>
                    <option value="50">50-74</option>
                    <option value="0">0-49</option>
                </select>
            </label>
            <label>Effort
                <select data-roadmap-filter="difficulty">
                    <option value="all">All effort</option>
                    <option value="easy">Easy</option>
                    <option value="moderate">Medium</option>
                    <option value="hard">Hard</option>
                </select>
            </label>
        </div>
        <div class="roadmap-backlog" data-roadmap-backlog>
            <div class="roadmap-backlog-list">
                ${filteredBacklog.length ? filteredBacklog.map(metric => renderRoadmapCard(metric)).join('') : '<span class="roadmap-slot-empty">No metrics match these filters.</span>'}
            </div>
        </div>
        <button class="next-step-btn next-step-btn--secondary" id="roadmap-back-ranking" type="button">&larr; Back to ranked metrics</button>
    `;
    panel.querySelectorAll('[data-roadmap-filter]').forEach(select => {
        const key = select.dataset.roadmapFilter;
        select.value = roadmapBacklogFilters[key];
        select.addEventListener('change', () => {
            roadmapBacklogFilters[key] = select.value;
            renderRoadmap();
        });
    });

    view.querySelectorAll('[data-roadmap-owner]').forEach(input => {
        input.addEventListener('input', () => { roadmapState.owners[Number(input.dataset.roadmapOwner)] = input.value; });
    });
    panel.querySelectorAll('[data-roadmap-metric-owner]').forEach(input => {
        input.addEventListener('input', () => {
            roadmapState.metricOwners[input.dataset.roadmapMetricOwner] = input.value;
        });
        input.addEventListener('click', event => event.stopPropagation());
    });
    document.querySelectorAll('.roadmap-card').forEach(card => {
        card.addEventListener('click', event => {
            if (event.target.closest('input')) return;
            const metric = roadmapFindMetric(card.dataset.roadmapMetricId);
            if (metric && typeof showCustomTooltip === 'function') showCustomTooltip(metric, event);
        });
        card.addEventListener('dragstart', event => {
            roadmapDragDropHandled = false;
            event.dataTransfer.setData('text/plain', card.dataset.roadmapMetricId);
            card.classList.add('roadmap-card--dragging');
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('roadmap-card--dragging');
            if (!roadmapDragDropHandled && roadmapLocation(card.dataset.roadmapMetricId)?.area === 'slot') {
                moveRoadmapToBacklog(card.dataset.roadmapMetricId);
            }
        });
    });
    view.querySelectorAll('[data-roadmap-slot]').forEach(slot => {
        slot.addEventListener('dragover', event => event.preventDefault());
        slot.addEventListener('drop', event => {
            event.preventDefault();
            roadmapDragDropHandled = true;
            const [phaseIndex, type] = slot.dataset.roadmapSlot.split(':');
            placeRoadmapMetric(event.dataTransfer.getData('text/plain'), Number(phaseIndex), type);
        });
    });
    const backlog = view.querySelector('[data-roadmap-backlog]');
    const panelBacklog = panel.querySelector('[data-roadmap-backlog]');
    const handleBacklogDrop = event => {
        event.preventDefault();
        moveRoadmapToBacklog(event.dataTransfer.getData('text/plain'));
    };
    [backlog, panelBacklog].filter(Boolean).forEach(backlogTarget => {
        backlogTarget.addEventListener('dragover', event => event.preventDefault());
        backlogTarget.addEventListener('drop', handleBacklogDrop);
    });
    panel.querySelector('#roadmap-back-ranking').addEventListener('click', () => {
        switchToStep(STEP.EXPLORE);
        showExploreStartView();
        showWizardStep('context-ranking-step');
    });
    view.querySelector('#roadmap-reset-btn').addEventListener('click', initializeRoadmap);
}

function renderRoadmapStatistics() {
    const slotted = roadmapState.placements.flatMap(Object.values).filter(Boolean);
    const used = slotted.reduce((total, metric) => total + roadmapDifficulty(metric).estimate, 0);
    const total = roadmapState.budget * ROADMAP_PHASES.length;
    const qualitative = slotted.filter(metric => roadmapType(metric) === 'qualitative').length;
    const quantitative = slotted.filter(metric => roadmapType(metric) === 'quantitative').length;
    const difficulties = { Easy: 0, Medium: 0, Hard: 0 };
    slotted.forEach(metric => {
        const label = roadmapDifficulty(metric).label;
        difficulties[label === 'E' ? 'Easy' : label === 'M' ? 'Medium' : 'Hard'] += 1;
    });
    const overflow = used > total;
    const warnings = [];
    roadmapState.placements.forEach(slots => {
        Object.entries(slots).forEach(([slotType, metric]) => {
            if (metric && roadmapType(metric) && roadmapType(metric) !== slotType) {
                const placedType = slotType === 'qualitative' ? 'Qualitative' : 'Quantitative';
                const metricType = roadmapType(metric) === 'qualitative' ? 'Qualitative' : 'Quantitative';
                warnings.push(`<strong>${escapeContextHtml(metric.name || 'Unnamed metric')}</strong> was placed in a ${placedType} slot but is a ${metricType} metric. We recommend pairing system logs with developer sentiment for a balanced perspective.`);
            }
        });
    });
    if (overflow) warnings.push(`Roadmap capacity exceeded by ${used - total}h. Consider moving metrics to another phase or reducing the scope.`);
    const scaleMax = Math.max(total, used);
    let consumed = 0;
    const capacitySegments = slotted.map(metric => {
        const estimate = roadmapDifficulty(metric).estimate;
        const cumulativeHours = consumed;
        consumed += estimate;
        let fill = '#3c8d40';
        if (cumulativeHours >= total) {
            fill = '#b23a32';
        } else if (cumulativeHours + estimate > total) {
            const safeRatio = ((total - cumulativeHours) / estimate) * 100;
            fill = `linear-gradient(to right, #3c8d40 0 ${safeRatio}%, #b23a32 ${safeRatio}% 100%)`;
        }
        return `<div class="roadmap-capacity-segment" style="background:${fill};width:${(estimate / scaleMax) * 100}%" title="${escapeContextHtml(metric.name || 'Unnamed metric')}: ${estimate}h" aria-label="${escapeContextHtml(metric.name || 'Unnamed metric')}, ${estimate} hours"></div>`;
    }).join('');
    const budgetMarker = overflow
        ? `<span class="roadmap-capacity-budget-marker" style="left:${(total / scaleMax) * 100}%"><span>Budget Limit</span></span>`
        : '';
    return `
        ${warnings.length ? `<div class="roadmap-alerts" role="status">${warnings.map(warning => `<div class="roadmap-alert" role="alert">${warning}</div>`).join('')}</div>` : ''}
        <div class="roadmap-stat roadmap-stat--capacity"><div class="roadmap-stat-label"><strong>Capacity Used</strong><span>${used}h / ${total}h</span></div><div class="roadmap-capacity-bar" role="img" aria-label="Roadmap capacity used: ${used} hours of ${total} hours"><div class="roadmap-capacity-bar-track">${capacitySegments}</div>${budgetMarker}</div></div>
        <div class="roadmap-statistics-bottom">
            <div class="roadmap-stat"><strong>Metric Balance</strong><span>${qualitative} Qualitative / ${quantitative} Quantitative</span></div>
            <div class="roadmap-stat"><strong>Difficulty</strong><span>${difficulties.Easy} Easy · ${difficulties.Medium} Medium · ${difficulties.Hard} Hard</span></div>
        </div>
    `;
}

function roadmapBacklogMatches(metric) {
    const { type, score, difficulty } = roadmapBacklogFilters;
    const metricScore = Number(metric.roadmapScore || 0);
    const scoreMatches = score === 'all' ||
        (score === '90' && metricScore >= 90) ||
        (score === '75' && metricScore >= 75 && metricScore < 90) ||
        (score === '50' && metricScore >= 50 && metricScore < 75) ||
        (score === '0' && metricScore < 50);
    return (type === 'all' || roadmapType(metric) === type) &&
        (difficulty === 'all' || String(metric.ease_of_collection || '').toLowerCase() === difficulty) &&
        scoreMatches;
}

function unlockRoadmapFromRanking() {
    roadmapUnlocked = true;
    document.querySelectorAll('.roadmap-step-control').forEach(el => { el.hidden = false; });
    initializeRoadmap();
    switchToStep(STEP.ROADMAP);
}
