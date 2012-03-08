function fibonacci(n) {
  if (n <= 1)
    return n < 0 ? 0 : n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}