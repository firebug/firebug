window.a = (window.a || 0) + 1;
if (typeof include !== "undefined")
    window.a = "FAIL, include has access to command line"
