(() => {
  // Ajax call to get the album file URL and trigger the download.
  document.getElementById("btn-get-album").addEventListener("click", () => {
    var xhr = new XMLHttpRequest();

    xhr.open("GET", `/album/${album.id}/file`, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "application/json");

    xhr.onload = () => {
      if (xhr.status === 200) {
        document.getElementById("alert-download").classList.add("alert-hide");
        var data = JSON.parse(xhr.responseText);
        var link = document.createElement("a");
        link.href = data.url;
        link.click();
      } else if (xhr.status === 204) {
        document
          .getElementById("alert-download")
          .classList.remove("alert-hide");
      }
    };

    xhr.send();
  });

  // Close the download alert when the close button is clicked.
  document.getElementById("alert-close").addEventListener("click", () => {
    document.getElementById("alert-download").classList.add("alert-hide");
  });
})();
