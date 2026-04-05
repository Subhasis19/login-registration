window.togglePassword = function togglePassword(id, icon) {
  const input = document.getElementById(id);
  if (!input) return;

  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  icon.classList.toggle("fa-eye", !isPassword);
  icon.classList.toggle("fa-eye-slash", isPassword);
};
