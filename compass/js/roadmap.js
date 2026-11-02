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
let roadmapActiveTab = 'backlog';
let isRoadmapIntroActive = false;

function addRoadmapOwner(value) {
    const owner = String(value || '').trim();
    if (owner && !uniqueOwners.includes(owner)) uniqueOwners.push(owner);
    return owner;
}

function roadmapOwnerInput(attribute, dataValue, ownerValue, label) {
    return `<label class="${label === 'Phase Owner' ? 'roadmap-owner' : 'roadmap-card-owner'}">${label}
            <span class="roadmap-owner-field">
                <input type="text" data-${attribute}="${dataValue}" value="${escapeContextHtml(ownerValue || '')}" placeholder="Add owner" autocomplete="off">
                <span class="roadmap-owner-chevron" aria-hidden="true">▼</span>
                <span class="roadmap-owner-dropdown" role="listbox" hidden></span>
            </span>
    </label>`;
}

function updateRoadmapOwnerState(input) {
    if (input.dataset.roadmapOwner !== undefined) {
            roadmapState.owners[Number(input.dataset.roadmapOwner)] = input.value;
    } else {
            roadmapState.metricOwners[input.dataset.roadmapMetricOwner] = input.value;
    }
}

function renderRoadmapOwnerDropdown(input) {
    const dropdown = input.closest('.roadmap-owner-field').querySelector('.roadmap-owner-dropdown');
    const query = input.value.trim().toLowerCase();
    const matches = uniqueOwners.filter(owner => !query || owner.toLowerCase().includes(query));
    dropdown.innerHTML = matches.map(owner =>
            `<button type="button" class="roadmap-owner-option" role="option" data-owner="${escapeContextHtml(owner)}">${escapeContextHtml(owner)}</button>`
    ).join('');
    dropdown.hidden = matches.length === 0;
    input.classList.toggle('roadmap-owner-input--open', !dropdown.hidden);
}

function closeRoadmapOwnerDropdown(input, commit = true) {
    if (commit) {
            const owner = addRoadmapOwner(input.value);
            input.value = owner;
            input.setAttribute('value', owner);
            updateRoadmapOwnerState(input);
    }
    const dropdown = input.closest('.roadmap-owner-field').querySelector('.roadmap-owner-dropdown');
    dropdown.hidden = true;
    input.classList.remove('roadmap-owner-input--open');
}

function bindRoadmapOwnerFields() {
    document.querySelectorAll('[data-roadmap-owner], [data-roadmap-metric-owner]').forEach(input => {
            input.addEventListener('focus', () => renderRoadmapOwnerDropdown(input));
            input.addEventListener('click', () => renderRoadmapOwnerDropdown(input));
            input.addEventListener('input', () => {
                updateRoadmapOwnerState(input);
                renderRoadmapOwnerDropdown(input);
            });
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    closeRoadmapOwnerDropdown(input);
                    input.blur();
                } else if (event.key === 'Escape') {
                    closeRoadmapOwnerDropdown(input, false);
                }
            });
            input.addEventListener('blur', () => setTimeout(() => closeRoadmapOwnerDropdown(input), 120));
            input.closest('.roadmap-owner-field').querySelector('.roadmap-owner-dropdown').addEventListener('mousedown', event => {
                const option = event.target.closest('.roadmap-owner-option');
                if (!option) return;
                event.preventDefault();
                input.value = option.dataset.owner;
                updateRoadmapOwnerState(input);
                closeRoadmapOwnerDropdown(input, false);
            });
    });
}

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

function reconcileRoadmapShortlist() {
    const activeMetrics = roadmapState
        ? roadmapState.placements.flatMap(Object.values).filter(Boolean)
        : [];
    clickedMetrics = activeMetrics.map(metric => ({ ...metric, collectionStatus: 'planning' }));
    saveClickedMetricsToLocalStorage();
    if (typeof updateStepBar === 'function') updateStepBar();
    if (typeof syncShortlistOptionVisibility === 'function') syncShortlistOptionVisibility();
}

function resetRoadmapState() {
    roadmapState = null;
    roadmapUnlocked = false;
    roadmapActiveTab = 'backlog';
    isRoadmapIntroActive = false;
    reconcileRoadmapShortlist();
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
    reconcileRoadmapShortlist();
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
            ${expectedType ? roadmapOwnerInput('roadmap-metric-owner', metric.id, roadmapState.metricOwners[metric.id], 'Metric Owner') : ''}
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
    if (source.area === 'backlog') {
        roadmapState.provenance[metric.id] = 'manual';
        addClickedMetric(metric, 'planning', 'roadmap');
    }
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
    removeClickedMetric(metric.id);
    roadmapState.backlog.sort(roadmapRankCompare);
    roadmapDragDropHandled = true;
    renderRoadmap();
}

function renderRoadmap() {
    const view = document.getElementById('roadmap-view');
    const panel = document.getElementById('roadmap-panel');
    if (!view || !panel || !roadmapState) return;
    view.innerHTML = `
        <div class="roadmap-actions" aria-label="Roadmap actions">
            <span class="roadmap-highlight">Wizard-generated plan</span>
            <div class="roadmap-action-buttons">
                <button class="next-step-btn next-step-btn--secondary roadmap-action-btn" id="roadmap-reset-btn" type="button">🔄 Reset Roadmap</button>
                <button class="next-step-btn next-step-btn--secondary roadmap-action-btn" id="roadmap-restart-ranking" type="button">📝 Restart Wizard</button>
                <button class="next-step-btn next-step-btn--secondary roadmap-action-btn" id="roadmap-pdf-btn" type="button">📥 Export Roadmap</button>
            </div>
        </div>
        <div class="roadmap-header">
            <div>
                <p class="roadmap-kicker">DevEx Improvement Initiative</p>
                <h1>90-Day Roadmap</h1>
                <p class="roadmap-subtitle">Balance the highest-ranked qualitative and quantitative metrics across three phases.</p>
            </div>
        </div>
        <div class="roadmap-phases">
            ${ROADMAP_PHASES.map((phase, phaseIndex) => `
                <section class="roadmap-phase">
                    <header class="roadmap-phase-header">
                        <div><h2>${phase.label}</h2><span>${phase.days}</span></div>
                        <strong>${roadmapState.budget} hours/month</strong>
                    </header>
                            ${roadmapOwnerInput('roadmap-owner', phaseIndex, roadmapState.owners[phaseIndex], 'Phase Owner')}
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
        </section>
    `;
    if (isRoadmapIntroActive) {
        view.insertAdjacentHTML('beforeend', `
            <div class="roadmap-intro-backdrop" aria-hidden="true"></div>
            <section class="roadmap-intro-dialog overlay-content" role="dialog" aria-modal="true" aria-labelledby="roadmap-intro-title">
                <h2 id="roadmap-intro-title">Your suggested roadmap is ready</h2>
                <div class="roadmap-intro-copy">
                    <p>On the right, you see the results of your context ranking.</p>
                    <p>You can update your context and restart the wizard at any time using the button above the ranking.</p>
                    <p>To edit your roadmap, you will drag and drop metrics from the Backlog tab.</p>
                    <p>Keep an eye on the capacity bar—metrics require varying levels of effort, and each phase has a strict budget.</p>
                </div>
                <button class="overlay-action-button" id="reveal-roadmap-btn" type="button">Reveal Suggested Roadmap</button>
            </section>
        `);
        view.querySelector('#reveal-roadmap-btn').addEventListener('click', revealSuggestedRoadmap);
    }
    const filteredBacklog = roadmapState.backlog.filter(roadmapBacklogMatches);
    const rankedMetrics = Array.isArray(contextRankingResults) ? contextRankingResults : [];
    panel.innerHTML = `
        <div class="welcome-provenance-tabs" role="tablist" aria-label="Roadmap metric lists">
            <span class="welcome-provenance-tab${roadmapActiveTab === 'backlog' ? ' active' : ''}" data-roadmap-tab="backlog" role="tab" tabindex="0" aria-selected="${roadmapActiveTab === 'backlog'}">Backlog</span>
            <span class="welcome-provenance-sep">&bull;</span>
            <span class="welcome-provenance-tab${roadmapActiveTab === 'ranking' ? ' active' : ''}" data-roadmap-tab="ranking" role="tab" tabindex="0" aria-selected="${roadmapActiveTab === 'ranking'}">Ranking</span>
        </div>
        <div class="roadmap-backlog${roadmapActiveTab === 'backlog' ? '' : ' hidden'}" data-roadmap-tab-panel="backlog">
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
        </div>
        <div class="roadmap-backlog${roadmapActiveTab === 'ranking' ? '' : ' hidden'}" data-roadmap-tab-panel="ranking">
            <div class="controls-title">Ranking Results</div>
            <div class="filter-description">Results of the ranking process.</div>
            <p class="filter-description">${rankedMetrics.length} eligible metrics ranked against your answers.</p>
            <div class="context-ranking-list">
                ${renderContextRankingCards(rankedMetrics)}
            </div>
        </div>
    `;
    panel.querySelectorAll('[data-roadmap-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            roadmapActiveTab = tab.dataset.roadmapTab;
            renderRoadmap();
        });
        tab.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                roadmapActiveTab = tab.dataset.roadmapTab;
                renderRoadmap();
            }
        });
    });
    panel.querySelectorAll('[data-roadmap-filter]').forEach(select => {
        const key = select.dataset.roadmapFilter;
        select.value = roadmapBacklogFilters[key];
        select.addEventListener('change', () => {
            roadmapBacklogFilters[key] = select.value;
            renderRoadmap();
        });
    });
    bindRoadmapOwnerFields();

    panel.querySelectorAll('[data-roadmap-metric-owner]').forEach(input => {
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
    view.querySelector('#roadmap-reset-btn').addEventListener('click', initializeRoadmap);
    view.querySelector('#roadmap-restart-ranking').addEventListener('click', restartContextProfiling);
    view.querySelector('#roadmap-pdf-btn').addEventListener('click', downloadRoadmapPdf);
}

async function downloadRoadmapPdf() {
    const roadmap = document.getElementById('roadmap-view');
    const button = document.getElementById('roadmap-pdf-btn');
    const JsPDF = window.jspdf?.jsPDF;
    if (!roadmap || typeof window.html2canvas !== 'function' || typeof JsPDF !== 'function') {
        console.error('Roadmap PDF export requires html2canvas and jsPDF to be loaded.');
        alert('The roadmap PDF export is unavailable because its PDF libraries did not load.');
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = 'Generating PDF…';
    }

    try {
        const canvas = await window.html2canvas(roadmap, {
            backgroundColor: '#f4f1ea',
            scale: 2,
            useCORS: true,
            onclone: clonedDocument => {
                const clonedRoadmap = clonedDocument.getElementById('roadmap-view');
                if (!clonedRoadmap) return;
                clonedRoadmap.style.fontFamily = 'Arial, sans-serif';
                clonedRoadmap.style.letterSpacing = 'normal';
                clonedRoadmap.style.textRendering = 'optimizeSpeed';
                clonedRoadmap.querySelectorAll('.roadmap-actions, .roadmap-intro-backdrop, .roadmap-intro-dialog').forEach(element => element.remove());
                clonedRoadmap.querySelector('.roadmap-phases')?.style.setProperty('grid-template-columns', 'repeat(3, minmax(0, 1fr))');
                clonedRoadmap.querySelectorAll('*').forEach(element => {
                    element.style.fontFamily = 'Arial, sans-serif';
                    element.style.letterSpacing = 'normal';
                    element.style.textRendering = 'optimizeSpeed';
                });
                clonedRoadmap.querySelectorAll('.roadmap-card-name').forEach(element => {
                    element.style.overflow = 'hidden';
                    element.style.textOverflow = 'ellipsis';
                    element.style.whiteSpace = 'nowrap';
                });
                clonedRoadmap.querySelectorAll('.roadmap-owner input, .roadmap-card-owner input').forEach(input => {
                    const ownerText = clonedDocument.createElement('div');
                    const computedStyle = clonedDocument.defaultView.getComputedStyle(input);
                    [
                        'background-color',
                        'border',
                        'border-radius',
                        'box-sizing',
                        'color',
                        'font-family',
                        'font-size',
                        'font-style',
                        'font-weight',
                        'height',
                        'letter-spacing',
                        'line-height',
                        'padding',
                        'text-align',
                        'width'
                    ].forEach(property => {
                        ownerText.style.setProperty(property, computedStyle.getPropertyValue(property));
                    });
                    ownerText.className = input.className;
                    ownerText.textContent = input.value;
                    ownerText.style.alignItems = 'center';
                    ownerText.style.display = 'flex';
                    ownerText.style.overflow = 'hidden';
                    ownerText.style.textOverflow = 'ellipsis';
                    ownerText.style.whiteSpace = 'nowrap';
                    input.replaceWith(ownerText);
                });
            }
        });

        const pdf = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const margin = 8;
        const pageWidth = 297 - margin * 2;
        const pageHeight = 210 - margin * 2;
        const imageRatio = canvas.width / canvas.height;
        let imageWidth = pageWidth;
        let imageHeight = pageWidth / imageRatio;
        if (imageHeight > pageHeight) {
            imageHeight = pageHeight;
            imageWidth = pageHeight * imageRatio;
        }
        pdf.addImage(
            canvas.toDataURL('image/jpeg', 0.92),
            'JPEG',
            margin + (pageWidth - imageWidth) / 2,
            margin + (pageHeight - imageHeight) / 2,
            imageWidth,
            imageHeight,
            undefined,
            'FAST'
        );
        pdf.save('90-day-roadmap.pdf');
    } catch (error) {
        console.error('Could not export roadmap PDF:', error);
        alert('The roadmap PDF could not be generated. Please try again.');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = '📥 Export Roadmap';
        }
    }
}

function renderContextRankingCards(rankedMetrics) {
    return rankedMetrics.map((item, index) => {
        const metric = item.metric;
        return `
            <article class="context-ranking-card">
                <div class="context-ranking-card-header">
                    <strong>#${index + 1}</strong>
                    <h3>${escapeContextHtml(metric.name || 'Unnamed metric')}</h3>
                    <span class="context-ranking-score">${metric.roadmapScore}/100</span>
                </div>
                <div class="context-ranking-chips">
                    <span>Goal ${item.breakdown.goal}/35</span>
                    <span>Friction ${item.breakdown.friction}/30</span>
                    <span>Type ${item.breakdown.type}/15</span>
                    <span>Bandwidth ${item.breakdown.bandwidth}/10</span>
                    <span>Consensus ${item.breakdown.consensus}/10</span>
                </div>
                <div class="context-ranking-metadata">
                    <span>${escapeContextHtml(item.cardsortGroup || 'Unknown group')}</span>
                    <span>${escapeContextHtml(item.ease || 'Unknown ease')}</span>
                    <span>${escapeContextHtml(contextCollectionLabel(item.collectionType))}</span>
                </div>
            </article>
        `;
    }).join('');
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
    roadmapActiveTab = 'ranking';
    isRoadmapIntroActive = true;
    document.querySelectorAll('.roadmap-step-control').forEach(el => { el.hidden = false; });
    initializeRoadmap();
    switchToStep(STEP.ROADMAP);
}

function revealSuggestedRoadmap() {
    isRoadmapIntroActive = false;
    roadmapActiveTab = 'backlog';
    renderRoadmap();
}
