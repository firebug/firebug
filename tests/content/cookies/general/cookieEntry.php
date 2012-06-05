<?php
    setcookie("TestCookieEntry", "ValueCookie23", mktime() + 86400, "/");
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Cookie Entry</title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<div class="topBar">
    <a href="../index.html">Test List</a>
</div>
<h1>Cookie Entry</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug, enable Cookies panel and refresh this page.</li>
<li>There should be a <b>TestCookieEntry</b> cookie displayed in the list.</li>
</ol>

</body>
</html>
