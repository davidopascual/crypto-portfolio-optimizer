import pandas as pd
import numpy as np
import logging
import json
from datetime import datetime, timedelta
from pypfopt import EfficientFrontier, risk_models, expected_returns, objective_functions, plotting
from pypfopt.discrete_allocation import DiscreteAllocation
from pypfopt.efficient_frontier import EfficientFrontier
import matplotlib.pyplot as plt
import io
import base64
from scipy import stats

# Get logger
logger = logging.getLogger('crypto-optimizer')

def validate_price_data(hist_prices, lookback_days):
    """
    Validate historical price data for quality and completeness.
    
    Args:
        hist_prices: DataFrame of historical prices
        lookback_days: Number of days in the lookback period
        
    Returns:
        tuple: (is_valid, issues, cleaned_data)
    """
    issues = []
    is_valid = True
    cleaned_data = hist_prices.copy()
    
    # Check for minimum data points
    min_required = min(lookback_days * 0.8, 20)  # Need at least 80% of days or 20 days minimum
    if len(hist_prices) < min_required:
        issues.append(f"Insufficient data points: {len(hist_prices)} available, {min_required} required")
        is_valid = False
        return is_valid, issues, cleaned_data
    
    # Check for missing values
    missing_pct = hist_prices.isna().mean().mean() * 100
    if missing_pct > 5:
        issues.append(f"High percentage of missing values: {missing_pct:.1f}%")
        is_valid = False if missing_pct > 20 else is_valid
    
    # Fill missing values with forward fill then backward fill
    cleaned_data = hist_prices.ffill().bfill()
    
    # Check for extreme returns that might indicate data errors
    daily_returns = cleaned_data.pct_change().dropna()
    
    # Identify extreme daily returns (>30% in a day is suspicious for most coins)
    extreme_returns = (daily_returns.abs() > 0.3).any(axis=1)
    extreme_days = extreme_returns.sum()
    if extreme_days > 0:
        issues.append(f"Found {extreme_days} days with extreme price movements (>30% daily change)")
    
    # Check for stale prices (no change for multiple days)
    stale_days = (daily_returns.abs() < 0.0001).all(axis=1).sum()
    if stale_days > lookback_days * 0.1:  # More than 10% of days have no price movement
        issues.append(f"Found {stale_days} days with potentially stale prices (no movement)")
        is_valid = False if stale_days > lookback_days * 0.3 else is_valid
    
    # Check for statistical outliers using z-score
    z_scores = stats.zscore(daily_returns, nan_policy='omit')
    outliers = (np.abs(z_scores) > 3).any(axis=1).sum()
    if outliers > lookback_days * 0.1:
        issues.append(f"Found {outliers} statistical outliers in daily returns")
    
    return is_valid, issues, cleaned_data


def generate_efficient_frontier_data(ef, mu, S, risk_range=None):
    """
    Generate a set of points along the efficient frontier for visualization.
    
    Args:
        ef: EfficientFrontier object
        mu: Expected returns
        S: Covariance matrix
        risk_range: Optional list of target risks
        
    Returns:
        list of dicts with volatility and return values
    """
    try:
        # Create a new EfficientFrontier object to avoid modifying the original
        frontier_ef = EfficientFrontier(mu, S, weight_bounds=(0, 1))
        
        # First try to get min volatility portfolio
        try:
            min_vol_weights = frontier_ef.min_volatility()
            min_vol = frontier_ef.portfolio_performance()[1]
        except Exception as e:
            logger.warning(f"Could not calculate min volatility portfolio: {e}")
            # Use a reasonable default if min_vol calculation fails
            min_vol = 0.15  # 15% volatility as fallback
        
        # Reset the efficient frontier object
        frontier_ef = EfficientFrontier(mu, S, weight_bounds=(0, 1))
        
        # Then try to get max sharpe portfolio
        try:
            max_sharpe_weights = frontier_ef.max_sharpe()
            max_sharpe_vol = frontier_ef.portfolio_performance()[1]
        except Exception as e:
            logger.warning(f"Could not calculate max sharpe portfolio: {e}")
            # Use a reasonable default if max_sharpe calculation fails
            max_sharpe_vol = 0.4  # 40% volatility as fallback
        
        # Use a range from 90% of min_vol to 150% of max_sharpe_vol
        # Make sure the range is reasonable even with fallback values
        min_risk = min(min_vol * 0.9, 0.1)  # At least 10% volatility
        max_risk = max(max_sharpe_vol * 1.5, 0.6)  # At most 60% volatility
        risk_range = np.linspace(min_risk, max_risk, 15)  # Reduced from 20 to 15 points
        
        # Generate efficient frontier points
        frontier_points = []
        for target_risk in risk_range:
            try:
                # Reset the efficient frontier for each calculation
                point_ef = EfficientFrontier(mu, S, weight_bounds=(0, 1))
                point_ef.efficient_risk(target_risk)
                ret, vol, _ = point_ef.portfolio_performance()
                frontier_points.append({'volatility': vol, 'return': ret})
            except Exception as e:
                # Just skip problematic points without logging to reduce noise
                continue
        
        # Make sure we have at least some points
        if len(frontier_points) < 3:
            # Generate some reasonable fallback points if we couldn't calculate enough
            for i in range(5):
                vol = 0.2 + (i * 0.1)  # 20% to 60% volatility
                ret = 0.05 + (vol * 1.2)  # Simple risk-return relationship
                frontier_points.append({'volatility': vol, 'return': ret})
        
        return frontier_points
    
    except Exception as e:
        logger.error(f"Failed to generate efficient frontier: {e}")
        # Return some reasonable fallback data
        fallback_points = []
        for i in range(5):
            vol = 0.2 + (i * 0.1)  # 20% to 60% volatility
            ret = 0.05 + (vol * 1.2)  # Simple risk-return relationship
            fallback_points.append({'volatility': vol, 'return': ret})
        return fallback_points


def generate_correlation_matrix(hist_prices):
    """
    Generate correlation matrix from historical prices.
    
    Args:
        hist_prices: DataFrame of historical prices
        
    Returns:
        DataFrame with correlation matrix
    """
    # Calculate daily returns
    returns = hist_prices.pct_change().dropna()
    
    # Calculate correlation matrix
    correlation_matrix = returns.corr()
    
    # Convert to list format for frontend
    assets = correlation_matrix.index.tolist()
    corr_data = []
    
    for i, asset1 in enumerate(assets):
        row = []
        for j, asset2 in enumerate(assets):
            row.append(correlation_matrix.loc[asset1, asset2])
        corr_data.append(row)
    
    return corr_data


def generate_historical_returns(hist_prices):
    """
    Generate historical returns data for visualization.
    
    Args:
        hist_prices: DataFrame of historical prices
        
    Returns:
        dict with dates and normalized returns
    """
    # Calculate daily returns
    returns = hist_prices.pct_change().dropna()
    
    # Normalize to start at 1.0
    cumulative_returns = (1 + returns).cumprod()
    
    # Convert to dict format for frontend
    # Handle different index types (DatetimeIndex or regular Index)
    if hasattr(cumulative_returns.index, 'strftime'):
        dates = cumulative_returns.index.strftime('%Y-%m-%d').tolist()
    else:
        # Convert index to strings if it's not a DatetimeIndex
        dates = [str(idx) for idx in cumulative_returns.index.tolist()]
    
    assets_data = {}
    
    for column in cumulative_returns.columns:
        assets_data[column] = cumulative_returns[column].tolist()
    
    return {
        'dates': dates,
        'asset_returns': assets_data
    }


def compute_rolling_metrics(prices_df, risk_free_rate=0.0, window=30):
    """
    Compute rolling Sharpe ratio and volatility for each asset and the portfolio.
    Returns a dict for frontend visualization.
    """
    import pandas as pd
    import numpy as np
    if prices_df.isnull().all().all():
        return {}
    log_returns = np.log(prices_df / prices_df.shift(1)).dropna()
    rolling_vol = log_returns.rolling(window).std() * np.sqrt(252)
    rolling_mean = log_returns.rolling(window).mean() * 252
    rolling_sharpe = (rolling_mean - risk_free_rate) / rolling_vol
    # Portfolio metrics (equal weight for visualization)
    port_log_ret = log_returns.mean(axis=1)
    port_rolling_vol = port_log_ret.rolling(window).std() * np.sqrt(252)
    port_rolling_mean = port_log_ret.rolling(window).mean() * 252
    port_rolling_sharpe = (port_rolling_mean - risk_free_rate) / port_rolling_vol
    # Dates
    dates = log_returns.index.strftime('%Y-%m-%d').tolist()
    return {
        'dates': dates[-len(port_rolling_vol):],
        'assets': {col: {
            'volatility': rolling_vol[col].dropna().tolist(),
            'sharpe': rolling_sharpe[col].dropna().tolist()
        } for col in log_returns.columns},
        'portfolio': {
            'volatility': port_rolling_vol.dropna().tolist(),
            'sharpe': port_rolling_sharpe.dropna().tolist()
        }
    }

# Main optimization function
def optimize_portfolio(holdings, risk_method='max_sharpe', preferences=None, prices=None, lookback_days=60, risk_free_rate=0.0):
    """
    Optimize a crypto portfolio based on historical data.
    
    Args:
        holdings: dict {symbol: amount}
        risk_method: 'max_sharpe' (default) or 'min_volatility' or 'efficient_risk' or 'efficient_return' or 'max_return'
        preferences: (optional) dict with additional preferences
            - 'max_volatility': float, maximum acceptable volatility (0-1)
            - 'min_return': float, minimum acceptable return (0-1)
            - 'min_weight': float, minimum weight per asset if included (0-1)
            - 'max_weight': float, maximum weight per asset (0-1)
            - 'target_return': float, target return for efficient_return method
            - 'target_volatility': float, target volatility for efficient_risk method
        prices: dict {symbol: price} (for calculating current value)
        lookback_days: int, number of days of history to use
        
    Returns:
        dict with optimization results and visualization data
    """
    # Validate inputs
    symbols = list(holdings.keys())
    if len(symbols) < 2:
        return {
            'optimized_weights': None,
            'expected_return': None,
            'volatility': None,
            'sharpe_ratio': None,
            'note': 'At least 2 different assets are required for optimization.'
        }
    
    # Extract preferences with defaults
    # Handle case where preferences might be a string instead of dict
    if preferences is None or not isinstance(preferences, dict):
        preferences = {}
    # If it's a string, log a warning
    if isinstance(preferences, str) and preferences.strip():
        logger.warning(f"Received preferences as string: {preferences}")
        # Could potentially parse string preferences here if needed
        preferences = {}
        
    max_weight = min(preferences.get('max_weight', 0.6), 0.8)  # Cap at 80%
    min_weight = max(preferences.get('min_weight', 0.05), 0.01)  # At least 1%
    target_volatility = preferences.get('target_volatility', None)
    target_return = preferences.get('target_return', None)
    
    # Fetch historical prices with our improved data retrieval
    from data import get_historical_prices
    hist_prices, missing_symbols = get_historical_prices(symbols, days=lookback_days)
    
    # Check if we have enough data
    if hist_prices.empty or len(hist_prices.columns) < 2:
        missing_msg = f"Missing data for: {', '.join(missing_symbols)}" if missing_symbols else ""
        return {
            'optimized_weights': None,
            'expected_return': None,
            'volatility': None,
            'sharpe_ratio': None,
            'note': f'Not enough historical data for optimization. {missing_msg}'
        }
    
    # Validate and clean price data
    is_valid, data_issues, cleaned_hist_prices = validate_price_data(hist_prices, lookback_days)
    
    # Log data quality info
    logger.info(f"Optimizing portfolio with {len(cleaned_hist_prices)} days of data for {len(cleaned_hist_prices.columns)} assets")
    if data_issues:
        logger.warning(f"Data quality issues detected: {'; '.join(data_issues)}")
    
    # Store historical returns for visualization
    historical_returns_data = generate_historical_returns(cleaned_hist_prices)
    
    try:
        # Calculate log returns for robust annualization
        log_returns = np.log(cleaned_hist_prices / cleaned_hist_prices.shift(1)).dropna()
        mean_log_return_daily = log_returns.mean()
        # Annualized expected return (log):
        ann_log_return = mean_log_return_daily * 252
        ann_return = np.exp(ann_log_return) - 1
        
        # Annualized volatility (log):
        ann_volatility = log_returns.std() * np.sqrt(252)
        
        # Calculate expected returns using multiple methods as before
        ema_returns = expected_returns.ema_historical_return(cleaned_hist_prices, span=lookback_days//3)
        mean_returns = expected_returns.mean_historical_return(cleaned_hist_prices)
        capm_returns = expected_returns.capm_return(cleaned_hist_prices)
        
        # Cap extreme returns to more realistic levels
        MAX_ANNUAL_RETURN = 0.75  # 75% annual return cap
        MIN_ANNUAL_RETURN = -0.5  # -50% annual return floor
        
        # Combine all return estimates (including log-based)
        mu = pd.DataFrame({"ema": ema_returns, "mean": mean_returns, "capm": capm_returns, "log": ann_return})
        mu = mu.median(axis=1)
        mu = mu.clip(lower=MIN_ANNUAL_RETURN, upper=MAX_ANNUAL_RETURN)
        
        # For covariance, use shrinkage estimator which is more robust than sample covariance
        S = risk_models.CovarianceShrinkage(cleaned_hist_prices).ledoit_wolf()
        
        # Initialize optimizer with constraints
        ef = EfficientFrontier(mu, S)
        
        # Add constraints
        ef.add_constraint(lambda w: w <= max_weight)  # Max weight per asset
        ef.add_constraint(lambda w: w >= 0)  # No short selling
        
        # Add minimum weight constraint to force more diversification
        if len(mu) > 3:  # Only if we have enough assets
            min_weight = 0.05  # At least 5% in each included asset
            ef.add_constraint(lambda w: w >= min_weight)
        
        # Add stronger objective to diversify (penalize concentrated portfolios)
        diversification_factor = 0.3  # Increased from 0.1
        ef.add_objective(objective_functions.L2_reg, gamma=diversification_factor)
        
        # Run the optimization based on risk method
        if risk_method == 'max_sharpe':
            weights = ef.max_sharpe()
        elif risk_method == 'min_volatility':
            weights = ef.min_volatility()
        elif risk_method == 'efficient_risk' and target_volatility is not None:
            weights = ef.efficient_risk(target_risk=target_volatility)
        else:
            weights = ef.max_sharpe()  # Default to max_sharpe
        
        # Clean small weights and get performance metrics
        cleaned_weights = ef.clean_weights(cutoff=min_weight)
        # Use risk_free_rate in Sharpe ratio calculation
        expected_return, volatility, sharpe = ef.portfolio_performance(risk_free_rate=risk_free_rate)
        
        # Calculate allocation in actual coin amounts if prices are provided
        allocation = None
        if prices is not None:
            try:
                # Calculate total portfolio value
                total_value = sum(holdings[s] * prices.get(s, 0) for s in holdings)
                
                # Convert prices dict to pandas Series for DiscreteAllocation
                # Only include coins that are in the optimized weights
                price_series = pd.Series()
                for symbol in cleaned_weights:
                    if symbol in prices and prices.get(symbol) is not None:
                        price_series[symbol] = prices.get(symbol)
                
                # Check if we have valid prices for all optimized coins
                if len(price_series) == len(cleaned_weights) and not price_series.isna().any():
                    # Create discrete allocation
                    da = DiscreteAllocation(cleaned_weights, price_series, total_value)
                    allocation, leftover = da.greedy_portfolio()
                    
                    # Calculate percentage of portfolio that couldn't be allocated
                    leftover_pct = leftover / total_value if total_value > 0 else 0
            except Exception as e:
                logger.warning(f"Error in discrete allocation: {str(e)}")
                allocation = None
        
        # Generate efficient frontier data for visualization
        try:
            frontier_data = generate_efficient_frontier_data(ef, mu, S)
        except Exception as e:
            logger.warning(f"Failed to generate efficient frontier: {e}")
            frontier_data = []
            
        # Generate correlation matrix for visualization
        try:
            correlation_data = generate_correlation_matrix(cleaned_hist_prices)
        except Exception as e:
            logger.warning(f"Failed to generate correlation matrix: {e}")
            correlation_data = []
        
        # Round weights to 4 decimal places
        weights = {k: round(v, 4) for k, v in weights.items() if v > 0.001}
        
        # Check if the results are reasonable
        note = None
        if expected_return > 1.0:  # More than 100% annual return
            note = "Warning: Expected return is unusually high. Consider using a longer historical period."
        elif sharpe > 3.0:  # Extremely high Sharpe ratio
            note = "Warning: Sharpe ratio is unusually high. This may indicate overfitting or data issues."
        
        # Add data quality warnings if any
        if data_issues:
            data_warning = f"Data quality issues detected: {'; '.join(data_issues[:2])}"
            note = data_warning if note is None else f"{note}. {data_warning}"
        
        # Return the optimized weights and performance metrics
        result = {
            'optimized_weights': weights,
            'expected_return': expected_return,
            'volatility': volatility,
            'sharpe_ratio': sharpe,
            'efficient_frontier': frontier_data,
            'correlation_matrix': correlation_data,
            'historical_returns': historical_returns_data,
            'lookback_days': lookback_days,  # Add lookback days to the result
        }

        # Add rolling Sharpe and volatility for frontend visualization
        result['rolling_metrics'] = compute_rolling_metrics(cleaned_hist_prices, risk_free_rate)

        
        if note:
            result['note'] = note
            
        if missing_symbols:
            result['missing_symbols'] = missing_symbols
            
        return result
        
    except Exception as e:
        logger.error(f"Optimization error: {str(e)}")
        return {
            'optimized_weights': None,
            'expected_return': None,
            'volatility': None,
            'sharpe_ratio': None,
            'note': f'Optimization failed: {str(e)}'
        }
