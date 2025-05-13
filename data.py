import requests
import pandas as pd
import numpy as np
import os
import json
import time
from datetime import datetime, timedelta
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger('crypto-optimizer')

# Cache directory for storing historical price data
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)

# Top coins by market cap with good historical data
SUPPORTED_COINS = [
    {'symbol': 'BTC', 'name': 'Bitcoin'},
    {'symbol': 'ETH', 'name': 'Ethereum'},
    {'symbol': 'USDT', 'name': 'Tether'},
    {'symbol': 'BNB', 'name': 'BNB'},
    {'symbol': 'SOL', 'name': 'Solana'},
    {'symbol': 'XRP', 'name': 'XRP'},
    {'symbol': 'ADA', 'name': 'Cardano'},
    {'symbol': 'DOGE', 'name': 'Dogecoin'},
    {'symbol': 'AVAX', 'name': 'Avalanche'},
    {'symbol': 'DOT', 'name': 'Polkadot'},
    {'symbol': 'MATIC', 'name': 'Polygon'},
    {'symbol': 'LTC', 'name': 'Litecoin'},
    {'symbol': 'TRX', 'name': 'TRON'},
    {'symbol': 'BCH', 'name': 'Bitcoin Cash'},
    {'symbol': 'LINK', 'name': 'Chainlink'},
    {'symbol': 'XLM', 'name': 'Stellar'},
    {'symbol': 'ATOM', 'name': 'Cosmos'},
    {'symbol': 'FIL', 'name': 'Filecoin'},
    {'symbol': 'UNI', 'name': 'Uniswap'},
    {'symbol': 'ICP', 'name': 'Internet Computer'},
    {'symbol': 'ETC', 'name': 'Ethereum Classic'}
]

# Map symbols to CoinGecko IDs
symbol_to_id = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'USDT': 'tether',
    'BNB': 'binancecoin',
    'SOL': 'solana',
    'XRP': 'ripple',
    'ADA': 'cardano',
    'DOGE': 'dogecoin',
    'AVAX': 'avalanche-2',
    'DOT': 'polkadot',
    'MATIC': 'matic-network',
    'LTC': 'litecoin',
    'TRX': 'tron',
    'BCH': 'bitcoin-cash',
    'LINK': 'chainlink',
    'XLM': 'stellar',
    'ATOM': 'cosmos',
    'FIL': 'filecoin',
    'UNI': 'uniswap',
    'ICP': 'internet-computer',
    'ETC': 'ethereum-classic'
}

# Cache management functions
def get_cache_path(coin_id, days):
    return os.path.join(CACHE_DIR, f"{coin_id}_{days}days.json")

def save_to_cache(coin_id, days, data):
    cache_path = get_cache_path(coin_id, days)
    with open(cache_path, 'w') as f:
        json.dump({
            'timestamp': time.time(),
            'data': data
        }, f)

def load_from_cache(coin_id, days, max_age_hours=24):
    cache_path = get_cache_path(coin_id, days)
    if not os.path.exists(cache_path):
        return None
    
    try:
        with open(cache_path, 'r') as f:
            cache_data = json.load(f)
        
        # Check if cache is still valid
        cache_age = time.time() - cache_data['timestamp']
        if cache_age > max_age_hours * 3600:
            return None
        
        return cache_data['data']
    except Exception as e:
        logger.warning(f"Error loading cache for {coin_id}: {e}")
        return None

# API call with rate limiting and retries
def api_call_with_retry(url, max_retries=3, backoff_factor=0.5, headers=None):
    if headers is None:
        headers = {'User-Agent': 'CryptoPortfolioOptimizer/1.0'}
    
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=10)
            
            # Handle rate limiting
            if response.status_code == 429:
                wait_time = backoff_factor * (2 ** attempt)
                logger.warning(f"Rate limited, waiting {wait_time} seconds")
                time.sleep(wait_time)
                continue
                
            # Handle other errors
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            logger.warning(f"API call failed (attempt {attempt+1}/{max_retries}): {e}")
            if attempt == max_retries - 1:
                logger.error(f"All retries failed for {url}")
                return None
            time.sleep(backoff_factor * (2 ** attempt))
    
    return None

# Alternative data sources for price data
DATA_SOURCES = {
    'coingecko': {
        'name': 'CoinGecko',
        'price_url': 'https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=usd',
        'history_url': 'https://api.coingecko.com/api/v3/coins/{id}/market_chart?vs_currency=usd&days={days}',
        'extract_price': lambda data, coin_id: data.get(coin_id, {}).get('usd'),
        'extract_history': lambda data: data.get('prices', [])
    },
    'coinapi': {
        'name': 'CoinAPI',
        'price_url': 'https://rest.coinapi.io/v1/exchangerate/{id}/USD',
        'history_url': 'https://rest.coinapi.io/v1/exchangerate/{id}/USD/history?period_id=1DAY&time_start={time_start}&time_end={time_end}',
        'headers': {'X-CoinAPI-Key': os.environ.get('COINAPI_KEY', '')},
        'extract_price': lambda data, _: data.get('rate'),
        'extract_history': lambda data: [[int(datetime.fromisoformat(item['time_period_start'].replace('Z', '+00:00')).timestamp()) * 1000, item['rate_close']] for item in data]
    }
}

# Function to validate price data
def validate_price_data(prices, symbols):
    """Validate price data for reasonableness"""
    if not prices or len(prices) == 0:
        return False, "No price data available"
    
    # Check for missing symbols
    missing = [s for s in symbols if s not in prices]
    if missing:
        return False, f"Missing prices for: {', '.join(missing)}"
    
    # Check for zero or negative prices
    invalid = [s for s in symbols if s in prices and (prices[s] <= 0 or prices[s] is None)]
    if invalid:
        return False, f"Invalid prices for: {', '.join(invalid)}"
    
    # Check for extreme outliers compared to cached data
    outliers = []
    for symbol in symbols:
        if symbol not in prices:
            continue
        
        # Compare with recent cached data if available
        cached_data = load_from_cache(symbol_to_id.get(symbol, ''), 7)
        if cached_data and 'prices' in cached_data and len(cached_data['prices']) > 0:
            latest_cached = cached_data['prices'][-1][1]
            current = prices[symbol]
            
            # Flag if price differs by more than 50% from cached
            if latest_cached > 0 and abs(current - latest_cached) / latest_cached > 0.5:
                outliers.append(symbol)
    
    if outliers:
        logger.warning(f"Possible price outliers detected for: {', '.join(outliers)}")
        # We don't fail validation for outliers, just log a warning
    
    return True, None

# Get live prices for multiple coins with multiple data sources and validation
def get_live_prices(symbols, use_multiple_sources=True):
    valid_symbols = [s for s in symbols if s in symbol_to_id]
    if not valid_symbols:
        return {}
    
    # Try primary data source first (CoinGecko)
    prices = _get_prices_from_source('coingecko', valid_symbols)
    
    # Validate the data
    is_valid, error_msg = validate_price_data(prices, valid_symbols)
    
    # If primary source fails or data is invalid, try alternative sources
    if (not is_valid or not prices) and use_multiple_sources:
        logger.warning(f"Primary price source failed: {error_msg if not is_valid else 'No data'}")
        
        # Try alternative sources if API key is available
        if os.environ.get('COINAPI_KEY'):
            logger.info("Trying alternative price source: CoinAPI")
            alt_prices = _get_prices_from_source('coinapi', valid_symbols)
            
            # If alternative source has valid data, use it
            alt_valid, alt_error = validate_price_data(alt_prices, valid_symbols)
            if alt_valid and alt_prices:
                logger.info("Using alternative price source data")
                prices = alt_prices
    
    # If all API sources fail, fall back to cached data
    if not prices or len(prices) < len(valid_symbols):
        logger.warning("Incomplete price data from APIs, using fallback data")
        fallback_prices = get_fallback_prices(valid_symbols)
        
        # Merge fallback data for missing symbols
        for symbol in valid_symbols:
            if symbol not in prices and symbol in fallback_prices:
                prices[symbol] = fallback_prices[symbol]
    
    # Final validation
    is_valid, _ = validate_price_data(prices, valid_symbols)
    if not is_valid:
        logger.error("Could not get valid price data from any source")
    
    return prices

# Get prices from a specific data source
def _get_prices_from_source(source_key, symbols):
    if source_key not in DATA_SOURCES:
        logger.error(f"Unknown data source: {source_key}")
        return {}
    
    source = DATA_SOURCES[source_key]
    prices = {}
    
    try:
        if source_key == 'coingecko':
            # CoinGecko allows batch requests
            ids = [symbol_to_id[s] for s in symbols if s in symbol_to_id]
            url = source['price_url'].format(ids="%2C".join(ids))
            data = api_call_with_retry(url, headers=source.get('headers'))
            
            if data:
                for symbol in symbols:
                    if symbol in symbol_to_id:
                        coin_id = symbol_to_id[symbol]
                        price = source['extract_price'](data, coin_id)
                        if price is not None:
                            prices[symbol] = price
        
        elif source_key == 'coinapi':
            # CoinAPI requires individual requests
            for symbol in symbols:
                if symbol in symbol_to_id:
                    coin_id = symbol_to_id[symbol]
                    url = source['price_url'].format(id=coin_id)
                    data = api_call_with_retry(url, headers=source.get('headers'))
                    
                    if data:
                        price = source['extract_price'](data, None)
                        if price is not None:
                            prices[symbol] = price
                    
                    # Avoid rate limiting
                    time.sleep(0.5)
    
    except Exception as e:
        logger.error(f"Error getting prices from {source['name']}: {str(e)}")
    
    return prices

# Fallback to get latest price from historical data
def get_fallback_prices(symbols, days=7):
    prices = {}
    for symbol in symbols:
        if symbol not in symbol_to_id:
            continue
            
        coin_id = symbol_to_id[symbol]
        cached_data = load_from_cache(coin_id, days)
        
        if cached_data and 'prices' in cached_data and len(cached_data['prices']) > 0:
            # Get the most recent price
            latest_price = cached_data['prices'][-1][1]
            prices[symbol] = latest_price
    
    return prices

# Get historical price data with caching and multiple sources
def get_historical_prices(symbols, days=60, use_multiple_sources=True):
    """Get historical price data for multiple symbols."""
    valid_symbols = [s for s in symbols if s in symbol_to_id]
    if not valid_symbols:
        return pd.DataFrame(), []
    
    all_prices = []
    missing_symbols = []
    
    for symbol in valid_symbols:
        coin_id = symbol_to_id[symbol]
        
        # Try to load from cache first
        cached_data = load_from_cache(coin_id, days)
        if cached_data:
            try:
                # Convert millisecond timestamps to datetime
                prices_data = cached_data['prices']
                timestamps = [datetime.fromtimestamp(ts/1000) for ts, _ in prices_data]
                values = [price for _, price in prices_data]
                prices = pd.DataFrame({symbol: values}, index=timestamps)
                all_prices.append(prices)
                continue
            except Exception as e:
                logger.warning(f"Error processing cached data for {symbol}: {e}")
        
        # If cache miss, fetch from API
        success = False
        
        # Try primary source first
        data = _get_historical_data('coingecko', coin_id, days)
        
        if not data and use_multiple_sources:
            # Try alternative source
            data = _get_historical_data('coinapi', coin_id, days)
        
        if data:
            success = True
            # Convert millisecond timestamps to datetime
            prices_data = data['prices']
            timestamps = [datetime.fromtimestamp(ts/1000) for ts, _ in prices_data]
            values = [price for _, price in prices_data]
            prices = pd.DataFrame({symbol: values}, index=timestamps)
            all_prices.append(prices)
            save_to_cache(coin_id, days, data)
        
        if not success:
            missing_symbols.append(symbol)
            logger.warning(f"Could not fetch historical data for {symbol}")
    
    if not all_prices:
        return pd.DataFrame(), valid_symbols
    
    # Combine all price data
    combined_prices = pd.concat(all_prices, axis=1)
    combined_prices.index = pd.to_datetime(combined_prices.index)  # Ensure datetime index
    combined_prices = combined_prices.sort_index()
    
    # Resample to daily frequency and forward fill missing values
    combined_prices = combined_prices.resample('D').last()
    combined_prices = combined_prices.fillna(method='ffill').fillna(method='bfill')
    
    return combined_prices, missing_symbols

def _get_historical_chunk(source_key, coin_id, days, start_date, end_date):
    """Get historical data chunk from specified source."""
    source = DATA_SOURCES.get(source_key)
    if not source:
        return None
    
    try:
        if source_key == 'coingecko':
            url = source['history_url'].format(id=coin_id, days=days)
            data = api_call_with_retry(url, headers=source.get('headers'))
            if data:
                return source['extract_history'](data)
        elif source_key == 'coinapi':
            url = source['history_url'].format(
                id=coin_id,
                time_start=start_date,
                time_end=end_date
            )
            data = api_call_with_retry(url, headers=source.get('headers'))
            if data:
                return source['extract_history'](data)
    except Exception as e:
        logger.warning(f"Error fetching chunk from {source_key} for {coin_id}: {e}")
    
    return None

def _get_historical_data(source_key, coin_id, days):
    """Get historical data from specified source."""
    source = DATA_SOURCES.get(source_key)
    if not source:
        return None
    
    try:
        if source_key == 'coingecko':
            url = source['history_url'].format(id=coin_id, days=days)
            data = api_call_with_retry(url, headers=source.get('headers'))
            if data:
                return {'prices': source['extract_history'](data)}
        elif source_key == 'coinapi':
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
            url = source['history_url'].format(
                id=coin_id,
                time_start=start_date.strftime('%Y-%m-%d'),
                time_end=end_date.strftime('%Y-%m-%d')
            )
            data = api_call_with_retry(url, headers=source.get('headers'))
            if data:
                return {'prices': source['extract_history'](data)}
    except Exception as e:
        logger.warning(f"Error fetching data from {source_key} for {coin_id}: {e}")
    
    return None
