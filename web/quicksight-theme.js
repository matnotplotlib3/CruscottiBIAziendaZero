// The embedded view inherits the same visual tokens as the surrounding BI portal.
export const quicksightTheme = {
  DataColorPalette: {
    Colors: ['#17669F', '#169B9F', '#B87924', '#C34D54', '#8177BA', '#6C9D73'],
    EmptyFillColor: '#E7EFF4',
    MinMaxGradient: ['#DCEFF0', '#17669F']
  },
  UIColorPalette: {
    PrimaryForeground: '#153753',
    PrimaryBackground: '#FFFFFF',
    SecondaryForeground: '#31516A',
    SecondaryBackground: '#F4F7FA',
    Accent: '#17669F',
    AccentForeground: '#FFFFFF',
    Danger: '#C34D54',
    DangerForeground: '#FFFFFF',
    Warning: '#B87924',
    WarningForeground: '#FFFFFF',
    Success: '#16856E',
    SuccessForeground: '#FFFFFF'
  },
  Sheet: {
    Background: { Color: '#F4F7FA' },
    Tile: {
      BackgroundColor: '#FFFFFF',
      Border: { Show: true, Color: '#DCE5EC', Width: '1px' },
      BorderRadius: '10px',
      Padding: '12px'
    },
    TileLayout: { Gutter: { Show: true }, Margin: { Show: true } }
  },
  Typography: {
    FontFamilies: [{ FontFamily: 'Segoe UI' }],
    VisualTitleFontConfiguration: {
      FontConfiguration: { FontColor: '#153753', FontFamily: 'Segoe UI', FontSize: { Absolute: '16px' }, FontWeight: { Name: 'BOLD' } },
      TextAlignment: 'LEFT'
    },
    VisualSubtitleFontConfiguration: {
      FontConfiguration: { FontColor: '#607487', FontFamily: 'Segoe UI', FontSize: { Absolute: '12px' } },
      TextAlignment: 'LEFT'
    },
    ControlTitleFontConfiguration: {
      FontConfiguration: { FontColor: '#31516A', FontFamily: 'Segoe UI', FontSize: { Absolute: '13px' }, FontWeight: { Name: 'BOLD' } },
      TextAlignment: 'LEFT'
    },
    AxisLabelFontConfiguration: { FontColor: '#607487', FontFamily: 'Segoe UI', FontSize: { Absolute: '12px' } },
    DataLabelFontConfiguration: { FontColor: '#31516A', FontFamily: 'Segoe UI', FontSize: { Absolute: '12px' } }
  }
};
