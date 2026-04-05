window.PASSWORD_POLICY_MESSAGE =
  "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.";

window.isStrongPassword = function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password || "");
};

window.getPasswordValidationMessage = function getPasswordValidationMessage(password) {
  if (!window.isStrongPassword(password)) {
    return window.PASSWORD_POLICY_MESSAGE;
  }

  return "";
};
