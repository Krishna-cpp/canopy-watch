"""Getis-Ord Gi* hot-spot statistic (Ord & Getis, 1995) with binary contiguity weights."""
import numpy as np


def gi_star(values, neighbours):
    """
    values:     (n,) array, e.g. forest loss in hectares per hex cell
    neighbours: list of index arrays; neighbours[i] must INCLUDE i itself (the '*' in Gi*)
    returns:    (n,) z-scores. z >= 1.96 ~ 95% confidence hot spot, z >= 2.58 ~ 99%.
    """
    x = np.asarray(values, dtype=float)
    n = len(x)
    mean = x.mean()
    s = np.sqrt((x ** 2).mean() - mean ** 2)
    z = np.zeros(n)
    if s == 0 or n < 3:
        return z
    for i, nb in enumerate(neighbours):
        w = len(nb)
        num = x[nb].sum() - mean * w
        den = s * np.sqrt((n * w - w * w) / (n - 1))
        z[i] = num / den if den > 0 else 0.0
    return z
