# Crypto Portfolio Optimizer

An open-source tool for optimizing cryptocurrency portfolios using modern portfolio theory and multiple data sources.

## Features

- **Multi-source Data Retrieval**: Uses CoinGecko as primary source with fallback options
- **Robust Data Validation**: Validates price data across sources and detects outliers
- **Advanced Portfolio Optimization**: Implements efficient frontier optimization with realistic constraints
- **Interactive UI**: Easy-to-use web interface for portfolio optimization
- **Transparent Results**: Provides clear warnings when results may be unrealistic
- **Data Caching**: Reduces API calls and improves performance

## Installation

1. Clone this repository:
```bash
git clone https://github.com/davidopascual/crypto-portfolio-optimizer.git
cd crypto-portfolio-optimizer
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. (Optional) Set up alternative data sources:
```bash
# For CoinAPI (alternative data source)
export COINAPI_KEY="your_coinapi_key_here"
```

## Usage

1. Start the application:
```bash
python app.py
```

2. Open your browser and navigate to:
```
http://localhost:5001
```

3. Enter your cryptocurrency holdings, adjust risk tolerance and lookback period, then click "Optimize Portfolio".

## How It Works

The optimizer uses modern portfolio theory to find the optimal allocation of assets that maximizes the Sharpe ratio (return per unit of risk) or minimizes volatility based on your risk preference.

### Data Sources

1. **Primary**: CoinGecko API (free, no API key required)
2. **Alternative**: CoinAPI (requires API key)
3. **Fallback**: Local cache when APIs are unavailable

### Optimization Methods

- **Max Sharpe Ratio**: Maximizes return per unit of risk (higher potential returns)
- **Min Volatility**: Minimizes portfolio volatility (more conservative)

### Data Quality Measures

- Multiple data sources with validation
- Outlier detection and removal
- Interpolation for small data gaps
- Conservative return estimates
- Realistic constraints on allocations

## Interpreting Results

The optimizer provides:
- Recommended allocation percentages for each asset
- Expected annual return (capped at realistic levels)
- Expected volatility
- Sharpe ratio
- Warnings for potentially unrealistic results

### What Makes Results Reliable

- **Reasonable Expected Returns**: Annual returns between 5-50% are realistic for crypto
- **Diversification**: Allocations spread across multiple assets
- **Consistent Results**: Similar results across different lookback periods
- **Data Quality**: No missing data or extreme outliers
- **Realistic Sharpe Ratio**: Values between 0.5-2.5 are typical

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This tool is for educational purposes only. Cryptocurrency investments are highly volatile and risky. Always do your own research before making investment decisions.
