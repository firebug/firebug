<?php
    setcookie("TestCookie34", "ValueCookie34", time() + 86400, "/firecookie", "", false, false);
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Issue 34: firecookie 0.8 cookies with .domain.com the first period gets erased on editing any attribute</title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<div class="topBar">
    <a href="http://code.google.com/p/firecookie/issues/detail?id=34">Issue 34</a>
</div>
<h1>Issue 34: firecookie 0.8 cookies with .domain.com the first period gets erased on editing any attribute</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug and select <b>Cookies</b> panel.</li>
<li>Right click on <i>TestCookie34</i> and pick the <b>Edit</b> action.</li>
<li>Use the dialog to change cookie's value.</li>
<li>The value should be properly changed.</li>
</ol>

</body>
</html>
