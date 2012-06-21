<?php
    setcookie("TestCookie23", "ValueCookie23", time() + 86400, "/", "", false, true);
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Issue 23: httpOnly cookies</title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<div class="topBar">
    <a href="http://code.google.com/p/firecookie/issues/detail?id=23">Issue 23</a>
</div>
<h1>Issue 23: httpOnly cookies</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug and select <b>Cookies</b> panel.</li>
<li>Right click on <i>TestCookie23</i> and pick the <b>Edit</b> action.</li>
<li>Use the dialog to change cookie's value.</li>
<li>The value should be properly changed (BUG).</li>
</ol>

<i>This is because the cookie has <b>HTTPOnly</b> flag.</i><br/>

</body>
</html>
