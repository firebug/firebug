<?php
    setcookie("TestCookieValues", "Test Cookie Value", 1565778363, "/dir", "", false, true);
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Cookie Values</title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<h1>Cookie Values</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug, enable Cookies panel and refresh this page.</li>
<li>There should be a <i>TestCookieValue</i> cookie in the list.</li>
<li>Verify cookie values:
    <ul>
        <li>Name: <code>TestCookieValues</code></li>
        <li>Value: <code>CookieValue</code></li>
        <li>Domain: <code id="domain"></code></li>
        <li>Size: <code>27 B</code></li>
        <li>Path: <code>/dir</code></li>
        <li>Expires: <code id="expires"></code> <i>should be 1565778363 in milliseconds</i></li>
        <li>HttpOnly: <code>HttpOnly</code></li>
    </ul> 
</li>
</ol>

<script>
var domain = document.getElementById("domain");
domain.innerHTML = location.host;

// Format the expires date using the current locale.
var date = new Date(1565778363 * 1000);
var expires = document.getElementById("expires");
expires.innerHTML = date.toLocaleString();
</script>

</body>
</html>
