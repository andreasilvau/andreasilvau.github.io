---
layout: post
title: "Birds of Chile"
author: "Andrea Silva Urzua"
categories: birdsOfChile
tags: [documentation,sample]
image: birdsOfChile.jpg
---

The following is a collection of birds native from Chile, my homecountry. They are made in watercolors


<style>
body {font-family: Arial, Helvetica, sans-serif;}

#myImg {
  border-radius: 5px;
  cursor: pointer;
  transition: 0.3s;
}

#myImg:hover {opacity: 0.7;}

/* The Modal (background) */
.modal {
  display: none; /* Hidden by default */
  position: fixed; /* Stay in place */
  z-index: 1; /* Sit on top */
  padding-top: 100px; /* Location of the box */
  left: 0;
  top: 0;
  width: 100%; /* Full width */
  height: 100%; /* Full height */
  overflow: auto; /* Enable scroll if needed */
  background-color: rgb(0,0,0); /* Fallback color */
  background-color: rgba(0,0,0,0.9); /* Black w/ opacity */
}

/* Modal Content (image) */
.modal-content {
  margin: auto;
  display: block;
  width: 80%;
  max-width: 700px;
}

/* Caption of Modal Image */
#caption {
  margin: auto;
  display: block;
  width: 80%;
  max-width: 700px;
  text-align: center;
  color: #ccc;
  padding: 10px 0;
  height: 150px;
}

/* Add Animation */
.modal-content, #caption {  
  -webkit-animation-name: zoom;
  -webkit-animation-duration: 0.6s;
  animation-name: zoom;
  animation-duration: 0.6s;
}

@-webkit-keyframes zoom {
  from {-webkit-transform:scale(0)} 
  to {-webkit-transform:scale(1)}
}

@keyframes zoom {
  from {transform:scale(0)} 
  to {transform:scale(1)}
}

/* The Close Button */
.close {
  position: absolute;
  top: 15px;
  right: 35px;
  color: #f1f1f1;
  font-size: 40px;
  font-weight: bold;
  transition: 0.3s;
}

.close:hover,
.close:focus {
  color: #bbb;
  text-decoration: none;
  cursor: pointer;
}

/* 100% Image Width on Smaller Screens */
@media only screen and (max-width: 700px){
  .modal-content {
    width: 100%;
  }
}
</style>

<h2>Image Modal</h2>
<p>In this example, we use CSS to create a modal (dialog box) that is hidden by default.</p>
<p>We use JavaScript to trigger the modal and to display the current image inside the modal when it is clicked on. Also note that we use the value from the image's "alt" attribute as an image caption text inside the modal.</p>

<img id="myImg" src="img_snow.jpg" alt="Snow" style="width:100%;max-width:300px">

<!-- The Modal -->
<div id="myModal" class="modal">
  <span class="close">&times;</span>
  <img class="modal-content" id="img01">
  <div id="caption"></div>
</div>

<script>
// Get the modal
var modal = document.getElementById("myModal");

// Get the image and insert it inside the modal - use its "alt" text as a caption
var img = document.getElementById("myImg");
var modalImg = document.getElementById("img01");
var captionText = document.getElementById("caption");
img.onclick = function(){
  modal.style.display = "block";
  modalImg.src = this.src;
  captionText.innerHTML = this.alt;
}

// Get the <span> element that closes the modal
var span = document.getElementsByClassName("close")[0];

// When the user clicks on <span> (x), close the modal
span.onclick = function() { 
  modal.style.display = "none";
}
</script>

## Chincol
<table border="0" style="width:100%">
<tr>
<td style="width:50%">
<img border="0" alt="Chincol" src="https://andreasilvau.github.io/assets/img/birds_chincol.jpg" style="width:100%">
</td>
<td style="width:50%">
This bird is blah blah. 
And the main
</td>
</tr>
</table>

## Chucao
<table border="0" style="width:100%">
<tr>
<td style="width:50%">
<img border="0" alt="Chucao" src="https://andreasilvau.github.io/assets/img/birds_chucao.jpg" style="width:100%">
</td>
<td style="width:50%">
This bird is blah blah. 
And the main
</td>
</tr>
</table>

## Cometocino
<table border="0" style="width:100%">
<tr>
<td style="width:50%">
<img border="0" alt="Cometocino" src="https://andreasilvau.github.io/assets/img/birds_cometocino.jpg" style="width:100%">
</td>
<td style="width:50%">
This bird is blah blah. 
And the main
</td>
</tr>
</table>

## Pinguino de Humboldt
<table border="0" style="width:100%">
<tr>
<td style="width:50%">
<img border="0" alt="Pinguino de Humboldt" src="https://andreasilvau.github.io/assets/img/birds_humboldt.jpg" style="width:100%">
</td>
<td style="width:50%">
This bird is blah blah. 
And the main
</td>
</tr>
</table>

## Picaflor chico
<table border="0" style="width:100%">
<tr>
<td style="width:50%">
<img border="0" alt="Picaflor chico" src="https://andreasilvau.github.io/assets/img/birds_picaflorchico.jpg" style="width:100%">
</td>
<td style="width:50%">
This bird is blah blah. 
And the main
</td>
</tr>
</table>

## Siete colores
<table border="0" style="width:100%">
<tr>
<td style="width:50%">
<img border="0" alt="Siete colores" src="https://andreasilvau.github.io/assets/img/birds_sietecolores.jpg" style="width:100%">
</td>
<td style="width:50%">
This bird is blah blah. 
And the main
</td>
</tr>
</table>

