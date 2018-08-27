let mangoPay;
export default mangoPay = {
	/**
	 * Handles card registration process
	 */
	cardRegistration: {

		/**
		 * MangoPay API base URL. The default value uses sandbox envronment.
		 *
		 * Set it to https://api.mangopay.com to enable production environment
		 */
		baseURL: "https://api.sandbox.mangopay.com",

		/**
		 * MangoPay Client ID to use with the MangoPay API
		 *
		 * Set it to your Client ID you use for MangoPay API
		 */
		clientId: "",

		/**
		 * Initialize card registration object
		 *
		 * @param {object} cardRegisterData Card pre-registration data {Id, cardRegistrationURL, preregistrationData, accessKey}
		 */
		init(cardRegisterData) {
			this._cardRegisterData = cardRegisterData;
		},


		/**
		 * Processes card registration and calls success or error callback
		 *
		 * @param {object} cardData Sensitive card details {cardNumber, cardType, cardExpirationDate, cardCvx}
		 * @param {function} successCallback A function to invoke when the card registration succeeds. It will receive CardRegistration object.
		 * @param {function} errorCallback A function to invoke when the the card registration fails. It will receive an error object {ResultCode, ResultMessage}.
		 */
		registerCard(cardData, successCallback, errorCallback) {

			// Browser is not capable of making cross-origin Ajax calls
			if (!mangoPay.browser.corsSupport()) {
				errorCallback({
					"ResultCode": "009999",
					"ResultMessage": "Browser does not support making cross-origin Ajax calls"
				});
				return;
			}

			// Validate card data
			var isCardValid = mangoPay.cardRegistration._validateCardData(cardData);
			if (isCardValid !== true) {
				errorCallback(isCardValid);
				return;
			}

			// Try to register card in two steps: get Payline token and then finish card registration with MangoPay API
			mangoPay.cardRegistration._tokenizeCard(
				cardData,
				successCallback,
				errorCallback
			);
		},


		/**
		 * PRIVATE. Validates card data. Returns true if card data is valid or a message string otherwise
		 *
		 * @param {object} cardData Sensitive card details {cardNumber, cardType, cardExpirationDate, cardCvx}
		 */
		_validateCardData(cardData) {

			// Validate card number
			var isCardValid = mangoPay._validation._cardNumberValidator._validate(cardData.cardNumber);
			if (isCardValid !== true) return isCardValid;

			// Validate expiration date
			var isDateValid = mangoPay._validation._expirationDateValidator._validate(cardData.cardExpirationDate, new Date());
			if (isDateValid !== true) return isDateValid;

			// Validate card CVx based on card type
			var isCvvValid = mangoPay._validation._cvvValidator._validate(cardData.cardCvx, cardData.cardType);
			if (isCvvValid !== true) return isCvvValid;

			// The data looks good
			return true;

		},

		/**
		 * PRIVATE. Gets Payline token for the card
		 *
		 * @param {object} cardData Sensitive card details {cardNumber, cardExpirationDate, cardCvx, cardType}
		 * @param {function} resultCallback A function to invoke when getting the token succeeds
		 * @param {function} successCallback A function to invoke when card registration succeeds
		 * @param {function} errorCallback A function to invoke when card registration fails
		 */
		_tokenizeCard(cardData, successCallback, errorCallback) {

			// Get Payline token
			mangoPay._networking._ajax({

				// Payline expects POST
				type: "post",

				// Payline service URL obtained from the mangoPay.cardRegistration.init() call
				url: this._cardRegisterData.cardRegistrationURL,

				// Force CORS
				crossDomain: true,

				// Sensitive card data plus pre-registration data and access key received from the mangoPay.cardRegistration.init() call
				data: {
					data: this._cardRegisterData.preregistrationData,
					accessKeyRef: this._cardRegisterData.accessKey,
					cardNumber: cardData.cardNumber,
					cardExpirationDate: cardData.cardExpirationDate,
					cardCvx: cardData.cardCvx
				},

				// Forward response to the return URL
				success(data, xmlhttp) {

					// Something wrong, no data came back from Payline
					if (data !== null && data.indexOf("errorCode=") === 0) {
						errorCallback({
							"xmlhttp": xmlhttp,
							"ResultCode": data.replace("errorCode=", ""),
							"ResultMessage": "Token processing error"
						});
						return;
					} else if (data === null) {
						errorCallback({
							"xmlhttp": xmlhttp,
							"ResultCode": "001599",
							"ResultMessage": "Token processing error"
						});
						return;
					}

					// Prepare data to send in the second step
					var dataToSend = {
						Id: mangoPay.cardRegistration._cardRegisterData.Id,
						RegistrationData: data
					};

					// Complete card regisration with MangoPay API
					successCallback(dataToSend);
				},

				// Invoke error callback
				error(xmlhttp, result) {
					if (result) return errorCallback(result);

					if (xmlhttp.status == "0") {//in a browser its shown as 499, however the client computer blocks the call even before it's able to do the Payline request (most likely due to an antivirus)
						errorCallback({
							"xmlhttp": xmlhttp,
							"ResultCode": "001596",
							"ResultMessage": "An HTTP request was blocked by the User's computer (probably due to an antivirus)"
						});
						return;
					}

					errorCallback({
						"xmlhttp": xmlhttp,
						"ResultCode": "001599",
						"ResultMessage": "Token processing error"
					});
					return;
				}
			});
		},
	},

	/**
	 * PRIVATE. Includes various validation code (private)
	 */
	_validation: {
		/**
		 * PRIVATE. Card CVx validation
		 */
		_cvvValidator: {
			/**
			 * PRIVATE. Validates CVV code
			 *
			 * @param {string} cvv Card CVx to check
			 * @param {string} cardType Type of card to check (AMEX or CB_VISA_MASTERCARD)
			 */
			_validate(cvv, cardType) {

				if (cardType === "MAESTRO" || cardType === "BCMC") {
					return true;
				}
				cvv = cvv ? cvv.trim() : "";
				cardType = cardType ? cardType.trim() : "";

				// CVV is 3 to 4 digits for AMEX cards and 3 digits for all other cards
				if (mangoPay._validation._helpers._validateNumericOnly(cvv) === true) {
					if ((cardType === "AMEX" && (cvv.length === 3 || cvv.length === 4))
						|| (cardType === "CB_VISA_MASTERCARD" && cvv.length === 3)) {
						return true;
					}
				}
				// Invalid format
				return {
					"ResultCode": "105204",
					"ResultMessage": "CVV_FORMAT_ERROR"
				};
			}
		},

		/**
		 * PRIVATE. Card expiration validation
		 */
		_expirationDateValidator: {

			/**
			 * PRIVATE. Validates date code in mmyy format
			 *
			 * @param {string} cardDate Card expiration date to check
			 */
			_validate(cardDate, currentDate) {

				cardDate = cardDate ? cardDate.trim() : "";

				// Requires 2 digit for month and 2 digits for year
				if (cardDate.length === 4) {

					var year = parseInt(cardDate.substr(2, 2), 10) + 2000;
					var month = parseInt(cardDate.substr(0, 2), 10);

					if (month > 0 && month <= 12) {

						var currentYear = currentDate.getFullYear();
						if (currentYear < year)
							return true;

						if (currentYear === year) {
							var currentMonth = currentDate.getMonth() + 1;
							if (currentMonth <= month)
								return true;
						}

						// Date is in the past
						return {
							"ResultCode": "105203",
							"ResultMessage": "PAST_EXPIRY_DATE_ERROR"
						};
					}
				}

				// Date does not look correct
				return {
					"ResultCode": "105203",
					"ResultMessage": "EXPIRY_DATE_FORMAT_ERROR"
				};
			}
		},

		/**
		 * PRIVATE. Card number validation
		 */
		_cardNumberValidator: {

			/**
			 * PRIVATE. Validates card number
			 *
			 * @param {string} cardNumber Card number to check
			 */
			_validate(cardNumber) {
				cardNumber = cardNumber ? cardNumber.trim() : "";
				return mangoPay._validation._helpers._validateNumericOnly(cardNumber) === false
				|| this._validateCheckDigit(cardNumber) === false ?
					{
						"ResultCode": "105202",
						"ResultMessage": "CARD_NUMBER_FORMAT_ERROR"
					} : true;
			},

			/**
			 * PRIVATE. Validates card number check digit
			 *
			 * @param {string} cardNumber Card number to check
			 */
			_validateCheckDigit(cardNumber) {

				// From https://stackoverflow.com/questions/12310837/implementation-of-luhn-algorithm
				var nCheck = 0,
					bEven = false,
					value = cardNumber.replace(/\D/g, "");

				for (var n = value.length - 1; n >= 0; n--) {
					var cDigit = value.charAt(n),
						nDigit = parseInt(cDigit, 10);
					if (bEven) {
						if ((nDigit *= 2) > 9) nDigit -= 9;
					}
					nCheck += nDigit;
					bEven = !bEven;
				}

				return (nCheck % 10) === 0;
			}
		},

		/**
		 * PRIVATE. Validation helpers
		 */
		_helpers: {
			/**
			 * PRIVATE. Validates if given string contain only numbers
			 * @param {string} input numeric string to check
			 */
			_validateNumericOnly(input) {
				return input.match(/^[0-9]+$/) ? true : false;
			}
		}
	},

	/**
	 * PRIVATE. Networking stuff
	 */
	_networking: {
		/**
		 * PRIVATE. Performs an asynchronous HTTP (Ajax) request
		 *
		 * @param {object} settings {type, crossDomain, url, data, success, error}
		 */
		_ajax(settings) {

			// XMLHttpRequest object
			var xmlhttp = new XMLHttpRequest();
			// Put together input data as string
			var parameters = "";
			for (var key in settings.data) {
				parameters += (parameters.length > 0 ? '&' : '') + key + "=" + encodeURIComponent(settings.data[key]);
			}

			// URL to hit, with parameters added for GET request
			var url = settings.url;
			if (settings.type === "get") {
				url = settings.url + (settings.url.indexOf("?") > -1 ? '&' : '?') + parameters;
			}

			function _on_exception(req, exc) {
				var code, msg;
				if (settings.crossDomain) {
					code = "001598";
					msg = "A cross-origin HTTP request failed";
				} else {
					code = "001597";
					msg = "An HTTP request failed";
				}
				if (exc && exc.message.length) {
					msg = msg + ': ' + exc.message;
				}
				settings.error(req, {ResultCode: code, ResultMessage: msg, xmlhttp: req});
			}

			// Cross-domain requests in IE 7, 8 and 9 using XDomainRequest
			if (settings.crossDomain && !("withCredentials" in xmlhttp) && window.XDomainRequest) {
				var xdr = new XDomainRequest();
				xdr.onerror = function () {
					settings.error(xdr);
				};
				xdr.onload = function () {
					settings.success(xdr.responseText, xdr);
				};
				try {
					xdr.open(settings.type, url);
					xdr.send(settings.type === "post" ? parameters : null);
				} catch (e) {
					return _on_exception(xdr, e);
				}
				return;
			}

			// Attach success and error handlers
			xmlhttp.onreadystatechange = function () {
				if (xmlhttp.readyState == 4) {
					if (/^2[0-9][0-9]$/.test(xmlhttp.status)) {
						settings.success(xmlhttp.responseText, xmlhttp);
					} else {
						settings.error(xmlhttp);
					}
				}
			};

			// Open connection
			try {
				xmlhttp.open(settings.type, url, true);
			} catch (e) {
				return _on_exception(xmlhttp, e);
			}

			// Send extra header for POST request
			if (settings.type === "post") {
				xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
			}

			// Send data
			try {
				xmlhttp.send(settings.type === "post" ? parameters : null);
			} catch (e) {
				return _on_exception(xmlhttp, e);
			}
		}
	},

	/**
	 * Browser support querying
	 */
	browser: {
		/**
		 * Returns true if browser is capable of making cross-origin Ajax calls
		 */
		corsSupport() {
			// Test if runtime is React Native
			return window.navigator.product === 'ReactNative' ? true :
				// IE 10 and above, Firefox, Chrome, Opera etc.
				"withCredentials" in new XMLHttpRequest() ? true :
					// IE 8 and IE 9
					!!window.XDomainRequest;
		}
	}
};
