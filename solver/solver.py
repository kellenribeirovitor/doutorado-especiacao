"""Solver numérico genérico em variáveis logarítmicas."""

from __future__ import annotations

from collections.abc import Callable

import numpy as np


def _jacobian(
    residual_function: Callable[[np.ndarray], np.ndarray],
    values: np.ndarray,
    residuals: np.ndarray,
    difference_step: float,
) -> np.ndarray:
    columns = []
    for index in range(values.size):
        step = difference_step * max(1.0, abs(values[index]))
        shifted = values.copy()
        shifted[index] += step
        shifted_residuals = np.asarray(residual_function(shifted), dtype=float)
        columns.append((shifted_residuals - residuals) / step)
    return np.column_stack(columns)


def solve_log_system(
    residual_function: Callable[[np.ndarray], np.ndarray],
    initial_values: np.ndarray,
    *,
    tolerance: float = 1e-10,
    max_iterations: int = 100,
    difference_step: float = 1e-6,
    min_log_concentration: float = -30.0,
    max_log_concentration: float = 2.0,
) -> dict:
    """Resolve um sistema quadrado por Newton amortecido com busca linear."""
    values = np.asarray(initial_values, dtype=float).copy()
    if values.ndim != 1 or values.size == 0:
        raise ValueError("O chute inicial deve ser um vetor unidimensional não vazio.")
    values = np.clip(values, min_log_concentration, max_log_concentration)

    for iteration in range(max_iterations + 1):
        residuals = np.asarray(residual_function(values), dtype=float)
        if residuals.shape != values.shape:
            raise ValueError(
                f"Sistema não quadrado: {residuals.size} equações para {values.size} variáveis."
            )
        if not np.all(np.isfinite(residuals)):
            raise ValueError("O sistema produziu resíduos não finitos.")
        residual_norm = float(np.linalg.norm(residuals, ord=np.inf))
        if residual_norm <= tolerance:
            return {
                "converged": True,
                "values": values,
                "iterations": iteration,
                "residuals": residuals,
                "residual_norm": residual_norm,
            }
        if iteration == max_iterations:
            break

        jacobian = _jacobian(
            residual_function, values, residuals, difference_step
        )
        if not np.all(np.isfinite(jacobian)):
            raise ValueError("O sistema produziu uma Jacobiana não finita.")

        newton_step, *_ = np.linalg.lstsq(jacobian, -residuals, rcond=None)
        max_step = float(np.linalg.norm(newton_step, ord=np.inf))
        if max_step > 3.0:
            newton_step *= 3.0 / max_step

        accepted = False
        damping = 1.0
        for _ in range(24):
            candidate = np.clip(
                values + damping * newton_step,
                min_log_concentration,
                max_log_concentration,
            )
            candidate_residuals = np.asarray(residual_function(candidate), dtype=float)
            candidate_norm = float(
                np.linalg.norm(candidate_residuals, ord=np.inf)
            )
            if np.isfinite(candidate_norm) and candidate_norm < residual_norm:
                values = candidate
                accepted = True
                break
            damping *= 0.5

        if not accepted:
            gradient = jacobian.T @ residuals
            gradient_norm = float(np.linalg.norm(gradient))
            if gradient_norm == 0 or not np.isfinite(gradient_norm):
                break
            direction = -gradient / gradient_norm
            damping = 1.0
            for _ in range(24):
                candidate = np.clip(
                    values + damping * direction,
                    min_log_concentration,
                    max_log_concentration,
                )
                candidate_residuals = np.asarray(
                    residual_function(candidate), dtype=float
                )
                candidate_norm = float(
                    np.linalg.norm(candidate_residuals, ord=np.inf)
                )
                if np.isfinite(candidate_norm) and candidate_norm < residual_norm:
                    values = candidate
                    accepted = True
                    break
                damping *= 0.5

        if not accepted:
            break

    final_residuals = np.asarray(residual_function(values), dtype=float)
    return {
        "converged": False,
        "values": values,
        "iterations": min(max_iterations, iteration),
        "residuals": final_residuals,
        "residual_norm": float(np.linalg.norm(final_residuals, ord=np.inf)),
    }
