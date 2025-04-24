
![Screenshot](Screenshot.png)

## Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

## Usage

Run the application:

```bash
python run.py [source_type] [source_index] [scale]
```

- **source_type**: `monitor` or `camera`
- **source_index**: Index of the monitor/camera (default `0`)
- **scale**: Window size scale (default `1.0`)

### Example

Capture from the all monitors:

```bash
python run.py monitor 0
```

Capture from the second monitor 1 with resize 1.0:

```bash
python run.py monitor 1 1.0
```

Capture from the second monitor 2 with resize 0.5:

```bash
python run.py monitor 2 0.5
```

Capture from the default camera:

```bash
python run.py camera 0
```

