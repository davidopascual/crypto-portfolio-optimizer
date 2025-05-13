let coins = [];
let historicalData = null;
let correlationMatrix = null;
let efficientFrontierData = null;

// Color palette for charts
const CHART_COLORS = [
    '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', 
    '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab',
    '#3366cc', '#dc3912', '#ff9900', '#109618', '#990099'
];

// Fetch supported coins for dropdown
async function fetchCoins() {
    try {
        const res = await fetch('/api/coins');
        if (!res.ok) throw new Error(`Failed to fetch coins: ${res.status}`);
        coins = await res.json();
        return coins;
    } catch (error) {
        console.error('Error fetching coins:', error);
        showError('Failed to load supported coins. Please refresh the page.');
        return [];
    }
}

function addHoldingRow(symbol = '', amount = '') {
    const idx = document.querySelectorAll('.holding-row').length;
    const row = document.createElement('div');
    row.className = 'row holding-row align-items-center mb-2';
    
    // Create a dropdown with search capability
    row.innerHTML = `
        <div class="col-6">
            <select class="form-select coin-select" required>
                <option value="">Select Coin</option>
                ${coins.map(c => `<option value="${c.symbol}">${c.name} (${c.symbol})</option>`).join('')}
            </select>
        </div>
        <div class="col-4">
            <input type="number" min="0" step="any" class="form-control amount-input" placeholder="Amount" value="${amount}" required>
        </div>
        <div class="col-2 text-end">
            <button type="button" class="btn btn-outline-danger btn-sm remove-holding">
                <i class="bi bi-trash"></i>
            </button>
        </div>
    `;
    
    document.getElementById('holdings-list').appendChild(row);
    
    // Set value if editing
    if (symbol) row.querySelector('.coin-select').value = symbol;
    
    // Add event listeners
    row.querySelector('.remove-holding').onclick = () => {
        row.classList.add('fade-out');
        setTimeout(() => row.remove(), 300);
    };
    
    // Validate inputs
    row.querySelector('.amount-input').addEventListener('input', validateInput);
    row.querySelector('.coin-select').addEventListener('change', checkDuplicates);
    
    return row;
}

// Validate numeric inputs
function validateInput(e) {
    const input = e.target;
    const value = parseFloat(input.value);
    
    if (isNaN(value) || value <= 0) {
        input.classList.add('is-invalid');
    } else {
        input.classList.remove('is-invalid');
    }
}

// Check for duplicate coins
function checkDuplicates() {
    const selects = document.querySelectorAll('.coin-select');
    const selectedCoins = Array.from(selects).map(select => select.value).filter(val => val);
    const duplicates = selectedCoins.filter((coin, index) => selectedCoins.indexOf(coin) !== index);
    
    selects.forEach(select => {
        if (duplicates.includes(select.value)) {
            select.classList.add('is-invalid');
            // Add warning message
            const parent = select.parentElement;
            if (!parent.querySelector('.invalid-feedback')) {
                const feedback = document.createElement('div');
                feedback.className = 'invalid-feedback';
                feedback.textContent = 'Duplicate coin selected';
                parent.appendChild(feedback);
            }
        } else {
            select.classList.remove('is-invalid');
        }
    });
    
    return duplicates.length === 0;
}

// Update risk description based on slider value
function updateRiskDescription() {
    const riskValue = parseInt(document.getElementById('risk').value, 10);
    const descriptionEl = document.getElementById('risk-description');
    
    switch(riskValue) {
        case 1:
            descriptionEl.textContent = 'Conservative (Min Volatility with Safety)';
            break;
        case 2:
            descriptionEl.textContent = 'Moderate (Min Volatility)';
            break;
        case 3:
            descriptionEl.textContent = 'Balanced (Max Sharpe Ratio)';
            break;
        case 4:
            descriptionEl.textContent = 'Growth (Efficient Return)';
            break;
        case 5:
            descriptionEl.textContent = 'Aggressive (Max Return)';
            break;
        default:
            descriptionEl.textContent = 'Balanced (Max Sharpe Ratio)';
    }
}

// Handle form errors and success messages
function showMessage(message, type = 'danger') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${type === 'danger' ? '<i class="bi bi-exclamation-triangle-fill me-2"></i>' : 
                          '<i class="bi bi-check-circle-fill me-2"></i>'}
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    const form = document.getElementById('portfolio-form');
    form.parentNode.insertBefore(alertDiv, form);
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => alertDiv.remove(), 150);
    }, 5000);
}

function showError(message) {
    showMessage(message, 'danger');
}

function showSuccess(message) {
    showMessage(message, 'success');
}

// Export results to CSV
function exportResults(data) {
    const sortedEntries = Object.entries(data.optimized_weights).sort((a, b) => b[1] - a[1]);
    let csvContent = 'Coin,Allocation (%),Current Amount\n';
    
    // Get current holdings
    const holdings = {};
    document.querySelectorAll('.holding-row').forEach(row => {
        const symbol = row.querySelector('.coin-select').value;
        const amount = parseFloat(row.querySelector('.amount-input').value);
        if (symbol && !isNaN(amount)) holdings[symbol] = amount;
    });
    
    // Create CSV rows
    sortedEntries.forEach(([symbol, weight]) => {
        const currentAmount = holdings[symbol] || 0;
        csvContent += `${symbol},${(weight*100).toFixed(2)},${currentAmount}\n`;
    });
    
    // Add portfolio stats
    csvContent += `\nPortfolio Statistics\n`;
    csvContent += `Expected Annual Return,${(data.expected_return*100).toFixed(2)}%\n`;
    csvContent += `Annual Volatility,${(data.volatility*100).toFixed(2)}%\n`;
    csvContent += `Sharpe Ratio,${data.sharpe_ratio.toFixed(2)}\n`;
    csvContent += `Optimization Date,${new Date().toISOString().split('T')[0]}\n`;
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `crypto-portfolio-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// On page load
window.onload = async () => {
    try {
        // Show loading indicator
        const loadingEl = document.createElement('div');
        loadingEl.className = 'text-center my-4';
        loadingEl.innerHTML = `
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2">Loading supported cryptocurrencies...</p>
        `;
        document.querySelector('.container').prepend(loadingEl);
        
        // Fetch coins
        await fetchCoins();
        loadingEl.remove();
        
        // Initialize form
        addHoldingRow('BTC', 0.1);
        addHoldingRow('ETH', 1);
        document.getElementById('add-holding').onclick = () => addHoldingRow();
        
        // Add event listeners
        const riskSlider = document.getElementById('risk');
        riskSlider.addEventListener('input', updateRiskDescription);
        updateRiskDescription(); // Initialize description
        
        // Initialize download button
        document.getElementById('download-results').addEventListener('click', () => {
            if (window.optimizationResults) {
                exportResults(window.optimizationResults);
            }
        });
        
        // Form submission
        document.getElementById('portfolio-form').onsubmit = async (e) => {
            e.preventDefault();
            
            // Validate form
            if (!validateForm()) return;
            
            // Hide welcome card, show loading
            document.getElementById('welcome-card').style.display = 'none';
            
            try {
                // Get form data
                const formData = getFormData();
                console.log('Submitting optimization with data:', formData);
                
                // Call API
                const res = await fetch('/api/optimize', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
                
                // Get the response text first for debugging
                const responseText = await res.text();
                
                // Check if the response is valid JSON
                let data;
                try {
                    data = JSON.parse(responseText);
                } catch (jsonError) {
                    console.error('Failed to parse API response as JSON:', responseText);
                    throw new Error(`API returned invalid JSON: ${jsonError.message}`);
                }
                
                if (!res.ok) {
                    console.error('API error response:', data);
                    throw new Error(`API returned ${res.status}: ${data.error || 'Unknown error'}`);
                }
                
                console.log('Received optimization data:', data);
                efficientFrontierData = data;
                
                // Show results
                showResults(data);
            } catch (error) {
                console.error('Optimization error:', error);
                showError(`Failed to optimize portfolio: ${error.message}. Please try again later.`);
            } finally {
                // Reset button
                document.getElementById('submit-btn').disabled = false;
                document.getElementById('submit-btn').innerHTML = '<i class="bi bi-lightning-charge me-1"></i> Optimize';
            }
        };
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize application. Please refresh the page.');
    }
};

// Validate the entire form
function validateForm() {
    // Check holdings
    const rows = document.querySelectorAll('.holding-row');
    let holdings = {};
    let isValid = true;
    
    rows.forEach(row => {
        const select = row.querySelector('.coin-select');
        const input = row.querySelector('.amount-input');
        const symbol = select.value;
        const amount = parseFloat(input.value);
        
        // Validate selection
        if (!symbol) {
            select.classList.add('is-invalid');
            isValid = false;
        } else {
            select.classList.remove('is-invalid');
        }
        
        // Validate amount
        if (isNaN(amount) || amount <= 0) {
            input.classList.add('is-invalid');
            isValid = false;
        } else {
            input.classList.remove('is-invalid');
            if (symbol) holdings[symbol] = amount;
        }
    });
    
    // Check if we have enough different coins
    if (Object.keys(holdings).length < 2) {
        showError('Please enter at least 2 different cryptocurrencies for optimization.');
        return false;
    }
    
    // Check for duplicates
    if (!checkDuplicates()) {
        showError('Please remove duplicate coin selections.');
        return false;
    }
    
    return isValid;
}

// Get all form data
function getFormData() {
    // Get holdings
    const rows = document.querySelectorAll('.holding-row');
    let holdings = {};
    
    rows.forEach(row => {
        const symbol = row.querySelector('.coin-select').value;
        const amount = parseFloat(row.querySelector('.amount-input').value);
        if (symbol && amount > 0) holdings[symbol] = amount;
    });
    
    // Get risk method
    const riskValue = parseInt(document.getElementById('risk').value, 10);
    let risk;
    
    switch(riskValue) {
        case 1:
            risk = 'min_volatility';
            break;
        case 2:
            risk = 'min_volatility';
            break;
        case 3:
            risk = 'max_sharpe';
            break;
        case 4:
            risk = 'efficient_return';
            break;
        case 5:
            risk = 'max_return';
            break;
        default:
            risk = 'max_sharpe';
    }
    
    // Get lookback period
    const lookback_days = parseInt(document.getElementById('lookback').value, 10);
    
    // Get max weight constraint
    const max_weight = parseFloat(document.getElementById('max-weight').value);
    
    // Create preferences object
    const preferences = {
        max_weight: max_weight
    };
    
    return { holdings, risk, preferences, lookback_days };
}

function showResults(data) {
    // Always try to render correlation matrix if possible
    tryRenderCorrelationMatrix(data);
    // If backend returned a note or missing weights, show message
    if (!data.optimized_weights || Object.keys(data.optimized_weights).length === 0) {
        let msg = data.note || 'Unable to optimize portfolio with current data.';
        document.getElementById('results-table').innerHTML = `<div class="alert alert-warning">${msg}</div>`;
        document.getElementById('expected-return').textContent = '-';
        document.getElementById('volatility').textContent = '-';
        document.getElementById('sharpe-ratio').textContent = '-';
        document.getElementById('results-section').style.display = '';
        document.getElementById('welcome-card').style.display = '';
        if (window.allocChart) window.allocChart.destroy();
        return;
    }
    
    // Hide welcome card, show results
    document.getElementById('welcome-card').style.display = 'none';
    document.getElementById('results-section').style.display = '';
    
    // Table with sorting by allocation
    const sortedEntries = Object.entries(data.optimized_weights).sort((a, b) => b[1] - a[1]);
    let html = `<table class="table table-hover">
                <thead>
                    <tr>
                        <th>Coin</th>
                        <th class="text-end">Allocation</th>
                    </tr>
                </thead>
                <tbody>`;
    
    for (const [symbol, weight] of sortedEntries) {
        // Add color indicator based on allocation size
        const colorClass = weight > 0.3 ? 'text-primary fw-bold' : (weight > 0.1 ? 'text-dark' : 'text-muted');
        
        html += `<tr>
                    <td>
                        <div class="d-flex align-items-center">
                            <div class="me-2" style="width: 12px; height: 12px; border-radius: 50%; background-color: ${CHART_COLORS[sortedEntries.indexOf([symbol, weight]) % CHART_COLORS.length]}"></div>
                            <span class="${colorClass}">${symbol}</span>
                        </div>
                    </td>
                    <td class="text-end ${colorClass}">${(weight*100).toFixed(2)}%</td>
                </tr>`;
    }
    html += '</tbody></table>';
    
    // Add notes/warnings if present
    if (data.note) {
        if (data.note.includes('Warning')) {
            html += `<div class="alert alert-warning mt-2 small">${data.note}</div>`;
        } else {
            html += `<div class="small text-muted mt-2">${data.note}</div>`;
        }
    }
    
    // Show missing symbols if any
    if (data.missing_symbols && data.missing_symbols.length > 0) {
        html += `<div class="alert alert-info mt-2 small">Some coins were excluded due to insufficient data: ${data.missing_symbols.join(', ')}</div>`;
    }
    
    document.getElementById('results-table').innerHTML = html;
    
    // Create allocation pie chart
    createAllocationChart(sortedEntries);
    
    // Display portfolio statistics
    displayPortfolioStats(data);
    
    // Create additional visualization charts
    if (data.historical_returns) {
        createEfficientFrontierChart(data);
        createHistoricalPerformanceChart(data);
        // createCorrelationMatrixChart(data); // Moved to tab event listener below
    } else {
        // Show message that additional visualizations require historical data
        document.querySelectorAll('#analysisTabs .tab-pane').forEach(pane => {
            if (!pane.classList.contains('active')) {
                pane.innerHTML = `
                    <div class="alert alert-info">
                        <i class="bi bi-info-circle me-2"></i>
                        Historical data is required for this visualization. Try increasing the lookback period.
                    </div>
                `;
            }
        });
    }
}

// Create allocation pie chart
function createAllocationChart(sortedEntries) {
    const canvas = document.getElementById('alloc-chart');
    if (!canvas) {
        console.error('Canvas element alloc-chart not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (window.allocChart) window.allocChart.destroy();
    
    // Create the chart with the plugin
    window.allocChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: sortedEntries.map(entry => entry[0]),
            datasets: [{
                data: sortedEntries.map(entry => entry[1]),
                backgroundColor: sortedEntries.map((_, index) => CHART_COLORS[index % CHART_COLORS.length]),
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            plugins: { 
                legend: { 
                    position: 'right',
                    labels: {
                        boxWidth: 15,
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw;
                            return `${label}: ${(value * 100).toFixed(2)}%`;
                        }
                    }
                },
                datalabels: {
                    formatter: (value, ctx) => {
                        // Only show labels for segments > 5%
                        if (value < 0.05) return '';
                        return `${(value * 100).toFixed(0)}%`;
                    },
                    color: '#fff',
                    font: {
                        weight: 'bold',
                        size: 11
                    }
                }
            },
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                animateRotate: true,
                animateScale: true
            }
        }
    });
}

// Display portfolio statistics
function displayPortfolioStats(data) {
    // Add info popovers for stats
    const infoSharpe = '<span tabindex="0" data-bs-toggle="popover" data-bs-trigger="focus" data-bs-content="The Sharpe ratio measures risk-adjusted return. Higher is better. Calculated as (Expected Return - Risk-Free Rate) / Volatility."><i class="bi bi-info-circle ms-1"></i></span>';
    const infoReturn = '<span tabindex="0" data-bs-toggle="popover" data-bs-trigger="focus" data-bs-content="Expected annual return, based on historical price data and robust math (log returns, median of several estimators)."><i class="bi bi-info-circle ms-1"></i></span>';
    const infoVol = '<span tabindex="0" data-bs-toggle="popover" data-bs-trigger="focus" data-bs-content="Annualized volatility (risk), computed from daily log returns. Higher means more risk."><i class="bi bi-info-circle ms-1"></i></span>';

    // Format expected return with appropriate color coding
    let expectedReturnClass = 'text-success';
    if (data.expected_return > 0.75) {
        expectedReturnClass = 'text-danger';
    } else if (data.expected_return > 0.5) {
        expectedReturnClass = 'text-warning';
    } else if (data.expected_return < 0) {
        expectedReturnClass = 'text-danger';
    }
    
    // Format volatility with appropriate color coding
    let volatilityClass = 'text-success';
    if (data.volatility > 0.5) {
        volatilityClass = 'text-danger';
    } else if (data.volatility > 0.3) {
        volatilityClass = 'text-warning';
    }
    
    // Format Sharpe ratio with appropriate color coding
    let sharpeClass = 'text-success';
    if (data.sharpe_ratio > 3) {
        sharpeClass = 'text-warning';
    } else if (data.sharpe_ratio < 0.5) {
        sharpeClass = 'text-danger';
    }
    
    // Update DOM elements
    document.getElementById('expected-return').innerHTML = 
        `<span class="${expectedReturnClass}">${(data.expected_return*100).toFixed(2)}%</span> ${infoReturn}`;
    
    document.getElementById('volatility').innerHTML = 
        `<span class="${volatilityClass}">${(data.volatility*100).toFixed(2)}%</span> ${infoVol}`;
    
    document.getElementById('sharpe-ratio').innerHTML = 
        `<span class="${sharpeClass}">${data.sharpe_ratio.toFixed(2)}</span> ${infoSharpe}`;
    
    // Initialize Bootstrap popovers
    if (window.bootstrap) {
        document.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
            new bootstrap.Popover(el);
        });
    }
}

// Create efficient frontier chart
function createEfficientFrontierChart(data) {
    const canvas = document.getElementById('frontier-chart');
    if (!canvas) {
        console.error('Canvas element frontier-chart not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (window.frontierChart) window.frontierChart.destroy();
    
    // Generate efficient frontier points (simplified version)
    // In a real implementation, this would come from the backend
    const frontierPoints = generateEfficientFrontier(data.volatility, data.expected_return);
    
    // Create the chart
    window.frontierChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Efficient Frontier',
                    data: frontierPoints.map(point => ({ x: point.volatility, y: point.return })),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    showLine: true,
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Optimized Portfolio',
                    data: [{ x: data.volatility, y: data.expected_return }],
                    borderColor: '#10b981',
                    backgroundColor: '#10b981',
                    pointRadius: 8,
                    pointHoverRadius: 10,
                    pointStyle: 'circle'
                },
                {
                    label: 'Individual Assets',
                    data: generateRandomAssetPoints(data.volatility, data.expected_return, Object.keys(data.optimized_weights).length),
                    borderColor: '#f59e0b',
                    backgroundColor: '#f59e0b',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointStyle: 'triangle'
                }
            ]
        },
        options: {
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Volatility (Risk)',
                        font: {
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        callback: value => `${(value * 100).toFixed(0)}%`
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Expected Return',
                        font: {
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        callback: value => `${(value * 100).toFixed(0)}%`
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const xValue = context.parsed.x;
                            const yValue = context.parsed.y;
                            return `${label}: Return ${(yValue * 100).toFixed(2)}%, Risk ${(xValue * 100).toFixed(2)}%`;
                        }
                    }
                },
                datalabels: {
                    display: false
                }
            },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Create historical performance chart with optimized loading
function createHistoricalPerformanceChart(data) {
    // Add toggle for rolling metrics overlay
    let toggleDiv = document.getElementById('rolling-metrics-toggle');
    if (!toggleDiv) {
        toggleDiv = document.createElement('div');
        toggleDiv.id = 'rolling-metrics-toggle';
        toggleDiv.className = 'mb-2';
        toggleDiv.innerHTML = `<label class="form-check-label"><input type="checkbox" class="form-check-input me-2" id="show-rolling-metrics"> Show Rolling Sharpe & Volatility</label>`;
        const perfCard = document.getElementById('performance-card') || document.getElementById('performance-chart').parentNode;
        perfCard.insertBefore(toggleDiv, perfCard.firstChild);
    }
    const rollingCheckbox = document.getElementById('show-rolling-metrics');
    if (rollingCheckbox) {
        rollingCheckbox.onchange = () => createHistoricalPerformanceChart(data);
    }

    const canvas = document.getElementById('performance-chart');
    if (!canvas) {
        console.error('Canvas element performance-chart not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (window.performanceChart) window.performanceChart.destroy();
    
    // Show loading indicator
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '14px Arial';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText('Loading chart...', canvas.width/2, canvas.height/2);
    
    // Use setTimeout to prevent UI blocking
    setTimeout(() => {
        try {
            // Use the actual lookback days from the optimization
            const lookbackDays = data.lookback_days || 30;
            const performanceData = generateHistoricalPerformance(data, lookbackDays);
            
            if (!performanceData || !performanceData.dates || performanceData.dates.length === 0) {
                throw new Error('No historical performance data available');
            }
            
            // Create the chart with minimal data points
            // Debug: log optimized_weights and assetValues
            console.log('Optimized Weights:', data.optimized_weights);
            console.log('Asset Values:', performanceData.assetValues);

            // Build datasets for portfolio and assets
            let datasets = [
                {
                    label: 'Optimized Portfolio',
                    data: performanceData.portfolioValues,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1
                },
                ...Object.keys(data.optimized_weights).map((symbol, index) => {
                    const assetData = performanceData.assetValues[index];
                    if (!assetData || assetData.length === 0) {
                        console.warn(`No data for asset ${symbol} at index ${index}`);
                        return null;
                    }
                    return {
                        label: symbol,
                        data: assetData,
                        borderColor: CHART_COLORS[index % CHART_COLORS.length],
                        borderWidth: 1,
                        borderDash: [5, 5],
                        fill: false
                    };
                }).filter(Boolean)
            ];

            // Add rolling metrics overlays if available and toggled
            const showRolling = document.getElementById('show-rolling-metrics')?.checked;
            if (showRolling && data.rolling_metrics && data.rolling_metrics.dates) {
                // Portfolio rolling volatility
                datasets.push({
                    label: 'Rolling Volatility (Portfolio)',
                    data: data.rolling_metrics.portfolio.volatility,
                    borderColor: '#f28e2b',
                    borderDash: [2,2],
                    fill: false,
                    yAxisID: 'y2',
                    pointRadius: 0,
                    tension: 0.1
                });
                // Portfolio rolling Sharpe
                datasets.push({
                    label: 'Rolling Sharpe (Portfolio)',
                    data: data.rolling_metrics.portfolio.sharpe,
                    borderColor: '#59a14f',
                    borderDash: [2,4],
                    fill: false,
                    yAxisID: 'y3',
                    pointRadius: 0,
                    tension: 0.1
                });
            }

            window.performanceChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: performanceData.dates,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        datalabels: {
                            display: false
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false
                        }
                    },
                    interaction: {
                        mode: 'nearest',
                        axis: 'x',
                        intersect: false
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'Portfolio/Asset Value' }
                        },
                        y2: {
                            type: 'linear',
                            display: showRolling ? true : false,
                            position: 'right',
                            grid: { drawOnChartArea: false },
                            title: { display: true, text: 'Rolling Volatility' }
                        },
                        y3: {
                            type: 'linear',
                            display: showRolling ? true : false,
                            position: 'right',
                            grid: { drawOnChartArea: false },
                            title: { display: true, text: 'Rolling Sharpe' },
                            offset: true
                        }
                    }
                }
            });
        } catch (e) {
            console.error('Error creating performance chart:', e);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillText('Error loading chart: ' + e.message, canvas.width/2, canvas.height/2);
        }
    }, 10);
}

// Render correlation matrix when the tab is shown, or immediately if data is present
function tryRenderCorrelationMatrix(data) {
    const correlationTab = document.getElementById('correlation-tab');
    if (correlationTab) {
        correlationTab.addEventListener('shown.bs.tab', function () {
            if (data && data.optimized_weights && Object.keys(data.optimized_weights).length > 0) {
                createCorrelationMatrixChart(data);
            } else {
                console.warn('No optimized_weights for correlation matrix');
            }
        });
    }
    // Also render immediately if the tab is already active
    if (
        correlationTab &&
        correlationTab.classList.contains('active') &&
        data && data.optimized_weights && Object.keys(data.optimized_weights).length > 0
    ) {
        createCorrelationMatrixChart(data);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    tryRenderCorrelationMatrix(efficientFrontierData);
});

// Create correlation matrix chart
function createCorrelationMatrixChart(data) {
    const correlationContainer = document.getElementById('correlation-chart-container');
    if (!correlationContainer) {
        console.error('Element correlation-chart-container not found');
        return;
    }
    
    // For correlation matrix, we'll use a table instead of a canvas
    // Clear previous content
    correlationContainer.innerHTML = '';
    
    // Generate simulated correlation matrix
    // In a real implementation, this would come from the backend
    const assets = Object.keys(data.optimized_weights);
    const correlationMatrix = generateCorrelationMatrix(assets);
    
    // Create a table-based visualization instead of using heatmap chart type
    // which may not be available in the default Chart.js
    const correlationDiv = document.getElementById('correlation');
    
    // Clear previous content
    correlationDiv.innerHTML = '';
    
    // Create a table for the correlation matrix
    const table = document.createElement('table');
    table.className = 'table table-sm correlation-table';
    
    // Create header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th></th>';
    
    assets.forEach(asset => {
        headerRow.innerHTML += `<th>${asset}</th>`;
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create table body with correlation values
    const tbody = document.createElement('tbody');
    
    correlationMatrix.forEach((row, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${assets[i]}</strong></td>`;
        
        row.forEach(value => {
            // Color coding based on correlation value
            let colorClass = '';
            if (value > 0.7) colorClass = 'bg-danger text-white';
            else if (value > 0.5) colorClass = 'bg-warning';
            else if (value > 0.3) colorClass = 'bg-info';
            else if (value < 0) colorClass = 'bg-success text-white';
            
            tr.innerHTML += `<td class="${colorClass}">${value.toFixed(2)}</td>`;
        });
        
        tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    correlationDiv.appendChild(table);
    
    // Add a legend
    const legend = document.createElement('div');
    legend.className = 'small text-muted mt-2';
    legend.innerHTML = `
        <div class="d-flex justify-content-between">
            <span><span class="badge bg-success">< 0</span> Negative</span>
            <span><span class="badge bg-light text-dark">0.0-0.3</span> Low</span>
            <span><span class="badge bg-info">0.3-0.5</span> Moderate</span>
            <span><span class="badge bg-warning">0.5-0.7</span> High</span>
            <span><span class="badge bg-danger">0.7+</span> Very High</span>
        </div>
    `;
    
    correlationDiv.appendChild(legend);
    
    // Add CSS for the correlation table
    const style = document.createElement('style');
    style.textContent = `
        .correlation-table td, .correlation-table th {
            text-align: center;
            padding: 0.3rem;
            font-size: 0.85rem;
        }
        .correlation-table td:first-child, .correlation-table th:first-child {
            text-align: left;
        }
    `;
    document.head.appendChild(style);
}

// Helper function to generate historical performance data
function generateHistoricalPerformance(data, days) {
    const dates = [];
    const portfolioValues = [];
    const assetValues = Object.keys(data.optimized_weights).map(() => []);
    
    // Ensure minimum number of data points and handle long periods
    const minDays = Math.max(days, 14); // At least 14 data points
    const maxPoints = 200; // Cap number of points for performance
    const skipDays = minDays > maxPoints ? Math.floor(minDays / maxPoints) : 1;
    
    // Generate dates (past N days to today)
    const today = new Date();
    for (let i = minDays; i >= 0; i -= skipDays) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        // Format date based on period length
        let dateStr;
        if (days > 365) {
            dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        } else if (days > 90) {
            dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else {
            dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        dates.push(dateStr);
    }
    
    // Generate portfolio and asset values
    let portfolioValue = 1.0; // Start at 1.0 (normalized)
    const assetStartValues = Object.keys(data.optimized_weights).map(() => 1.0);
    
    // Adjust volatility factors for period length
    const periodAdjustment = Math.sqrt(60 / Math.max(days, 30)) * (days > 365 ? 0.7 : 1); // Reduce volatility for longer periods
    const portfolioVolFactor = (data.volatility / Math.sqrt(252)) * periodAdjustment;
    const assetVolFactors = Object.keys(data.optimized_weights).map(() => 
        (data.volatility * (0.8 + Math.random() * 0.4)) / Math.sqrt(252) * periodAdjustment
    );
    
    // Generate random walks with period-appropriate volatility
    let currentIndex = 0;
    for (let i = minDays; i >= 0; i -= skipDays) {
        if (currentIndex > 0) {
            // Portfolio random walk with drift
            const annualizedDrift = data.expected_return;
            const drift = (annualizedDrift / 252) * skipDays; // Adjust for skipped days
            const randomShock = portfolioVolFactor * Math.sqrt(skipDays) * (Math.random() * 2 - 1);
            portfolioValue = portfolioValue * (1 + drift + randomShock);
            portfolioValues.push(portfolioValue);
            
            // Asset random walks
            Object.keys(data.optimized_weights).forEach((_, index) => {
                const assetDrift = (data.expected_return * (0.8 + Math.random() * 0.4)) / 252 * skipDays;
                const assetShock = assetVolFactors[index] * Math.sqrt(skipDays) * (Math.random() * 2 - 1);
                assetStartValues[index] = assetStartValues[index] * (1 + assetDrift + assetShock);
                assetValues[index].push(assetStartValues[index]);
            });
        } else {
            // First day values
            portfolioValues.push(portfolioValue);
            Object.keys(data.optimized_weights).forEach((_, index) => {
                assetValues[index].push(assetStartValues[index]);
            });
        }
        currentIndex++;
    }
    
    return { dates, portfolioValues, assetValues };
}

// Helper function to generate efficient frontier points
function generateEfficientFrontier(portfolioVolatility, portfolioReturn) {
    const points = [];
    const days = window.currentLookbackDays || 60;
    
    // Adjust scaling based on lookback period
    // For longer periods, use a gentler scaling factor
    let periodScale = 1.0;
    if (days <= 60) {
        periodScale = Math.sqrt(60 / days);
    } else if (days <= 180) {
        periodScale = Math.sqrt(60 / days) * 0.85;
    } else {
        periodScale = Math.sqrt(60 / days) * 0.7;
    }
    
    // Adjust volatility range based on period
    const minVolFactor = days <= 60 ? 0.4 : (days <= 180 ? 0.5 : 0.6);
    const maxVolFactor = days <= 60 ? 2.5 : (days <= 180 ? 2.2 : 2.0);
    
    const minVol = portfolioVolatility * minVolFactor;
    const maxVol = portfolioVolatility * maxVolFactor / periodScale;
    const steps = 20;
    
    for (let i = 0; i <= steps; i++) {
        const volatility = minVol + (maxVol - minVol) * (i / steps);
        // Adjust risk-return relationship based on period
        const riskAdjustment = days <= 60 ? 1.2 : (days <= 180 ? 1.15 : 1.1);
        const returnValue = (Math.pow(volatility / portfolioVolatility, riskAdjustment) * portfolioReturn);
        points.push({ volatility, return: returnValue });
    }
    
    return points;
}

// Helper function to generate random asset points for the efficient frontier chart
function generateRandomAssetPoints(portfolioVolatility, portfolioReturn, count) {
    const points = [];
    const days = window.currentLookbackDays || 60;
    const periodScale = Math.sqrt(60 / Math.max(days, 30)) * (days > 365 ? 0.7 : 1);
    const baseVol = portfolioVolatility;
    const baseReturn = portfolioReturn;
    
    for (let i = 0; i < count; i++) {
        // Generate points with period-adjusted scaling
        const volatility = baseVol * (0.7 + Math.random() * (days > 365 ? 1.5 : 1.8) / periodScale);
        const returnValue = baseReturn * (0.6 + Math.random() * (days > 365 ? 0.7 : 0.8));
        points.push({ x: volatility, y: returnValue });
    }
    
    return points;
}

// Helper function to generate a correlation matrix
function generateCorrelationMatrix(assets) {
    const n = assets.length;
    const matrix = Array(n).fill().map(() => Array(n).fill(0));
    
    // Fill the matrix
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i === j) {
                // Diagonal elements are always 1 (perfect correlation with self)
                matrix[i][j] = 1;
            } else if (j > i) {
                // Generate random correlation between -0.2 and 0.8
                // Crypto assets tend to be positively correlated
                matrix[i][j] = -0.2 + Math.random() * 1.0;
                // Make the matrix symmetric
                matrix[j][i] = matrix[i][j];
            }
        }
    }
    
    return matrix;
}
