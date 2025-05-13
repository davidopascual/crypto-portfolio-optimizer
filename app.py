from flask import Flask, request, jsonify, render_template
import logging
import traceback
import time
from optimizer import optimize_portfolio
from data import get_live_prices, SUPPORTED_COINS, get_historical_prices

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger('crypto-optimizer')

app = Flask(__name__)

@app.route('/api/optimize', methods=['POST'])
def optimize():
    try:
        start_time = time.time()
        data = request.json
        
        if not data:
            return jsonify({
                'error': 'No data provided',
                'optimized_weights': None
            }), 400
        
        holdings = data.get('holdings', {})
        risk = data.get('risk', 'max_sharpe')
        preferences = data.get('preferences', {})
        
        # Ensure preferences is a dictionary
        if not isinstance(preferences, dict):
            logger.warning(f"Received non-dict preferences: {preferences}, converting to empty dict")
            preferences = {}
            
        lookback_days = int(data.get('lookback_days', 60))
        
        # Validate holdings
        if not holdings or len(holdings) < 2:
            return jsonify({
                'error': 'At least 2 holdings are required',
                'optimized_weights': None,
                'note': 'Please provide at least 2 different cryptocurrencies to optimize.'
            }), 400
        
        # Get live prices
        logger.info(f"Getting prices for {list(holdings.keys())}")
        prices = get_live_prices(list(holdings.keys()))
        
        if not prices:
            return jsonify({
                'error': 'Could not retrieve current prices',
                'optimized_weights': None,
                'note': 'Unable to retrieve current prices. Please try again later.'
            }), 500
        
        # Run optimization
        logger.info(f"Running optimization with risk={risk}, lookback={lookback_days} days")
        result = optimize_portfolio(holdings, risk, preferences, prices, lookback_days)
        
        # Log performance
        duration = time.time() - start_time
        logger.info(f"Optimization completed in {duration:.2f} seconds")
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error in optimization: {str(e)}\n{traceback.format_exc()}")
        return jsonify({
            'error': str(e),
            'optimized_weights': None,
            'note': 'An error occurred during optimization. Please try again with different parameters.'
        }), 500

@app.route('/api/coins')
def coins():
    return jsonify(SUPPORTED_COINS)

@app.route('/api/health')
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'version': '1.0.0'})

@app.route('/api/data-quality', methods=['POST'])
def data_quality():
    """Check data quality for specific coins"""
    try:
        data = request.json
        symbols = data.get('symbols', [])
        days = int(data.get('days', 60))
        
        if not symbols:
            return jsonify({'error': 'No symbols provided'}), 400
        
        # Get historical data
        df, missing = get_historical_prices(symbols, days=days)
        
        # Calculate data quality metrics
        result = {
            'symbols_requested': symbols,
            'symbols_available': list(df.columns),
            'symbols_missing': missing,
            'days_available': len(df),
            'days_requested': days,
            'coverage_percent': (len(df) / days) * 100 if days > 0 else 0
        }
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error in data quality check: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    # Try a different port if 5001 is in use
    try:
        app.run(debug=True, host='0.0.0.0', port=5001)
    except OSError:
        logger.info("Port 5001 in use, trying 5002")
        app.run(debug=True, host='0.0.0.0', port=5002)
