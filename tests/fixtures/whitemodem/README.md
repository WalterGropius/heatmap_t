# WhiteModemFeatures fixtures

Test and validation splits of the Roboflow dataset the shipped YOLOv8n
detector (`public/model/`) was trained on, used by `scripts/ar-preview.mjs`
to drive the camera steps (`/router`, `/install`) with real router photos
instead of a live camera.

- Source: <https://universe.roboflow.com/modem/whitemodemfeatures/dataset/4>
  (WhiteModemFeatures v4, exported 2025-04-23)
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Images are 640 × 640 (stretched from the original photos), labels are
  YOLOv8 `class cx cy w h`, normalized. Class ids are listed in `data.yaml`.

The training split is not included: the preview only needs photos that cover
every tour step, and the model has already seen the training images.
